import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { pemToPkcs8, createAppJwt, fileIssue, GitHubError } from '../src/github.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PKCS1 = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const PKCS8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const NOW = 1_800_000_000_000;

function decodePart(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function verifies(jwt: string): boolean {
  const [header, payload, signature] = jwt.split('.');
  const verify = createVerify('RSA-SHA256');
  verify.update(`${header}.${payload}`);
  return verify.verify(publicKey, Buffer.from(signature!, 'base64url'));
}

describe('pemToPkcs8', () => {
  test('a PKCS#8 key comes back as its DER bytes', () => {
    const der = pemToPkcs8(PKCS8);
    assert.deepEqual(Buffer.from(der), privateKey.export({ type: 'pkcs8', format: 'der' }));
  });

  test('a PKCS#1 key (the format GitHub downloads) is wrapped as PKCS#8', () => {
    const der = pemToPkcs8(PKCS1);
    assert.deepEqual(Buffer.from(der), privateKey.export({ type: 'pkcs8', format: 'der' }));
  });

  test('tolerates Windows line endings and surrounding whitespace', () => {
    const der = pemToPkcs8(`\n  ${PKCS1.replace(/\n/g, '\r\n')}  \n`);
    assert.deepEqual(Buffer.from(der), privateKey.export({ type: 'pkcs8', format: 'der' }));
  });

  test('a secret pasted with literal \\n sequences still works', () => {
    const der = pemToPkcs8(PKCS1.replace(/\n/g, '\\n'));
    assert.deepEqual(Buffer.from(der), privateKey.export({ type: 'pkcs8', format: 'der' }));
  });

  test('rejects anything that is not a private key', () => {
    assert.throws(() => pemToPkcs8('not a key'), /private key/);
    assert.throws(() => pemToPkcs8(publicKey.export({ type: 'spki', format: 'pem' }).toString()), /private key/);
  });
});

describe('createAppJwt', () => {
  for (const [name, pem] of [['PKCS#1', PKCS1], ['PKCS#8', PKCS8]] as const) {
    test(`signs with RS256 from a ${name} key`, async () => {
      const jwt = await createAppJwt('Iv1.abc', pem, NOW);
      assert.equal(verifies(jwt), true);
      assert.deepEqual(decodePart(jwt.split('.')[0]!), { alg: 'RS256', typ: 'JWT' });
    });
  }

  test('is issued 60 s in the past and lasts under 10 minutes', async () => {
    const jwt = await createAppJwt('Iv1.abc', PKCS1, NOW);
    const now = NOW / 1000;
    assert.deepEqual(decodePart(jwt.split('.')[1]!), { iat: now - 60, exp: now + 540, iss: 'Iv1.abc' });
  });
});

interface Call { url: string; method: string; headers: Record<string, string>; body?: unknown }

function mockFetch(responses: Array<{ status: number; json?: unknown }>) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      ...(init?.body !== undefined && { body: JSON.parse(String(init.body)) }),
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return new Response(next.json === undefined ? null : JSON.stringify(next.json), { status: next.status });
  };
  return { fetch, calls };
}

describe('fileIssue', () => {
  const issue = { title: '[BUG] Reply never arrives', body: 'It hangs.', labels: ['user-report', 'bug'] };
  const app = { clientId: 'Iv1.abc', privateKey: PKCS1 };

  test('finds the installation, gets a token for that repo only, and creates the issue', async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, json: { id: 77 } },
      { status: 201, json: { token: 'ghs_install' } },
      { status: 201, json: { html_url: 'https://github.com/ScottKirvan/BojuBot/issues/500', number: 500 } },
    ]);
    const result = await fileIssue('ScottKirvan/BojuBot', issue, app, { fetch, now: NOW });
    assert.deepEqual(result, { url: 'https://github.com/ScottKirvan/BojuBot/issues/500', number: 500 });

    assert.equal(calls[0]!.url, 'https://api.github.com/repos/ScottKirvan/BojuBot/installation');
    assert.equal(calls[0]!.method, 'GET');
    assert.match(calls[0]!.headers.authorization!, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    assert.equal(verifies(calls[0]!.headers.authorization!.slice(7)), true);

    assert.equal(calls[1]!.url, 'https://api.github.com/app/installations/77/access_tokens');
    assert.equal(calls[1]!.method, 'POST');
    assert.deepEqual(calls[1]!.body, { repositories: ['BojuBot'], permissions: { issues: 'write' } });

    assert.equal(calls[2]!.url, 'https://api.github.com/repos/ScottKirvan/BojuBot/issues');
    assert.equal(calls[2]!.method, 'POST');
    assert.equal(calls[2]!.headers.authorization, 'Bearer ghs_install');
    assert.deepEqual(calls[2]!.body, issue);

    for (const call of calls) {
      assert.equal(call.headers.accept, 'application/vnd.github+json');
      assert.equal(call.headers['x-github-api-version'], '2022-11-28');
      assert.equal(call.headers['user-agent'], 'report-relay');
    }
  });

  test('fails when the App is not installed on the repo', async () => {
    const { fetch, calls } = mockFetch([{ status: 404, json: { message: 'Not Found' } }]);
    await assert.rejects(fileIssue('ScottKirvan/BojuBot', issue, app, { fetch, now: NOW }), (e: unknown) =>
      e instanceof GitHubError && e.step === 'installation' && e.status === 404);
    assert.equal(calls.length, 1);
  });

  test('fails when the token request is refused', async () => {
    const { fetch } = mockFetch([{ status: 200, json: { id: 77 } }, { status: 403, json: {} }]);
    await assert.rejects(fileIssue('ScottKirvan/BojuBot', issue, app, { fetch, now: NOW }), (e: unknown) =>
      e instanceof GitHubError && e.step === 'token' && e.status === 403);
  });

  test('fails when GitHub refuses the issue', async () => {
    const { fetch } = mockFetch([
      { status: 200, json: { id: 77 } },
      { status: 201, json: { token: 'ghs_install' } },
      { status: 422, json: { message: 'Validation Failed' } },
    ]);
    await assert.rejects(fileIssue('ScottKirvan/BojuBot', issue, app, { fetch, now: NOW }), (e: unknown) =>
      e instanceof GitHubError && e.step === 'issue' && e.status === 422);
  });

  test('fails on a success status with an unexpected body', async () => {
    const { fetch } = mockFetch([{ status: 200, json: { nope: true } }]);
    await assert.rejects(fileIssue('ScottKirvan/BojuBot', issue, app, { fetch, now: NOW }), (e: unknown) =>
      e instanceof GitHubError && e.step === 'installation');
  });
});
