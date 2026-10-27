import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, MAX_REQUEST_BYTES, type Env, type RateLimiter } from '../src/handler.ts';
import { GitHubError, type FiledIssue } from '../src/github.ts';
import type { Issue } from '../src/report.ts';

function limiter(allowed = true): RateLimiter & { keys: string[] } {
  const keys: string[] = [];
  return { keys, limit: async ({ key }) => { keys.push(key); return { success: allowed }; } };
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    APPS: '{"bojubot":"ScottKirvan/BojuBot"}',
    FILING_ENABLED: 'true',
    GITHUB_APP_CLIENT_ID: 'Iv1.abc',
    GITHUB_APP_PRIVATE_KEY: 'pem',
    PER_IP_LIMIT: limiter(),
    ALL_LIMIT: limiter(),
    ...overrides,
  };
}

const REPORT = { app: 'bojubot', type: 'bug', title: '[BUG] Reply never arrives', body: 'It hangs.' };

function post(body: unknown, headers: Record<string, string> = {}, path = '/report'): Request {
  return new Request(`https://relay.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function filer(result: FiledIssue | Error = { url: 'https://github.com/ScottKirvan/BojuBot/issues/500', number: 500 }) {
  const calls: Array<{ repo: string; issue: Issue }> = [];
  return {
    calls,
    fileIssue: async (repo: string, issue: Issue) => {
      calls.push({ repo, issue });
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

describe('handle', () => {
  test('files a valid report and returns the issue link', async () => {
    const f = filer();
    const response = await handle(post(REPORT), env(), f);
    assert.equal(response.status, 201);
    assert.deepEqual(await json(response), { url: 'https://github.com/ScottKirvan/BojuBot/issues/500', number: 500 });
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(f.calls, [{
      repo: 'ScottKirvan/BojuBot',
      issue: {
        title: '[BUG] Reply never arrives',
        body: 'It hangs.\n\n---\n_Sent from the in-app report form in bojubot._',
        labels: ['user-report', 'bug'],
      },
    }]);
  });

  test('only POST /report exists', async () => {
    const f = filer();
    const notFound = await handle(post(REPORT, {}, '/other'), env(), f);
    assert.equal(notFound.status, 404);
    assert.deepEqual(await json(notFound), { error: 'not_found' });

    const get = await handle(new Request('https://relay.example/report'), env(), f);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');
    assert.deepEqual(await json(get), { error: 'method_not_allowed' });
    assert.equal(f.calls.length, 0);
  });

  test('the kill switch refuses every report before anything else runs', async () => {
    for (const value of ['false', '', undefined]) {
      const perIp = limiter();
      const f = filer();
      const response = await handle(post(REPORT), env({ FILING_ENABLED: value, PER_IP_LIMIT: perIp }), f);
      assert.equal(response.status, 503, String(value));
      assert.deepEqual(await json(response), { error: 'disabled' });
      assert.equal(perIp.keys.length, 0);
      assert.equal(f.calls.length, 0);
    }
  });

  test('rate limits per IP address and overall, before reading the report', async () => {
    const perIp = limiter(false);
    const f = filer();
    const response = await handle(post('not json'), env({ PER_IP_LIMIT: perIp }), f);
    assert.equal(response.status, 429);
    assert.deepEqual(await json(response), { error: 'rate_limited' });
    assert.deepEqual(perIp.keys, ['203.0.113.5']);

    const all = limiter(false);
    const overall = await handle(post(REPORT), env({ ALL_LIMIT: all }), f);
    assert.equal(overall.status, 429);
    assert.deepEqual(all.keys, ['all']);
    assert.equal(f.calls.length, 0);
  });

  test('requires a JSON content type', async () => {
    const response = await handle(post(REPORT, { 'content-type': 'text/plain' }), env(), filer());
    assert.equal(response.status, 415);
    assert.deepEqual(await json(response), { error: 'unsupported_media_type' });

    const charset = await handle(post(REPORT, { 'content-type': 'application/json; charset=utf-8' }), env(), filer());
    assert.equal(charset.status, 201);
  });

  test('refuses an oversized request', async () => {
    const big = JSON.stringify({ ...REPORT, body: 'x'.repeat(MAX_REQUEST_BYTES) });
    const response = await handle(post(big), env(), filer());
    assert.equal(response.status, 413);
    assert.deepEqual(await json(response), { error: 'payload_too_large' });
  });

  test('refuses broken JSON and invalid reports with the field at fault', async () => {
    const broken = await handle(post('{"app":'), env(), filer());
    assert.equal(broken.status, 400);
    assert.deepEqual(await json(broken), { error: 'invalid_json' });

    const invalid = await handle(post({ ...REPORT, title: '' }), env(), filer());
    assert.equal(invalid.status, 400);
    assert.deepEqual(await json(invalid), { error: 'invalid_report', field: 'title' });

    const unknown = await handle(post({ ...REPORT, app: 'other' }), env(), filer());
    assert.equal(unknown.status, 400);
    assert.deepEqual(await json(unknown), { error: 'unknown_app' });
  });

  test('a GitHub failure is a 502 and logs only the step and status', async () => {
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      const response = await handle(post(REPORT), env(), filer(new GitHubError('issue', 422)));
      assert.equal(response.status, 502);
      assert.deepEqual(await json(response), { error: 'upstream_error' });
    } finally {
      console.error = original;
    }
    assert.deepEqual(logged, [['github_error', 'issue', 422]]);
  });

  test('missing GitHub App settings are reported as not configured, without filing', async () => {
    for (const missing of [{ GITHUB_APP_CLIENT_ID: undefined }, { GITHUB_APP_PRIVATE_KEY: '' }]) {
      const f = filer();
      const response = await handle(post(REPORT), env(missing), f);
      assert.equal(response.status, 503);
      assert.deepEqual(await json(response), { error: 'not_configured' });
      assert.equal(f.calls.length, 0);
    }
  });

  test('an unexpected error is a 500 and its message is not logged', async () => {
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      const response = await handle(post(REPORT), env(), filer(new Error('It hangs. secret detail')));
      assert.equal(response.status, 500);
      assert.deepEqual(await json(response), { error: 'internal_error' });
    } finally {
      console.error = original;
    }
    assert.deepEqual(logged, [['internal_error']]);
  });

  test('a request without a client IP is still rate limited, under one shared key', async () => {
    const perIp = limiter();
    const request = new Request('https://relay.example/report', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(REPORT),
    });
    await handle(request, env({ PER_IP_LIMIT: perIp }), filer());
    assert.deepEqual(perIp.keys, ['unknown']);
  });
});
