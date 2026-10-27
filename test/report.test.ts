import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, buildIssue, parseApps, BODY_MAX, TITLE_MAX } from '../src/report.ts';

const APPS = { bojubot: 'ScottKirvan/BojuBot' };
const valid = { app: 'bojubot', type: 'bug', title: '[BUG] Reply never arrives', body: 'It hangs.' };

describe('parseApps', () => {
  test('reads the app-to-repo map', () => {
    assert.deepEqual(parseApps('{"bojubot":"ScottKirvan/BojuBot","quki-notes":"ScottKirvan/QuKi-Notes"}'), {
      bojubot: 'ScottKirvan/BojuBot',
      'quki-notes': 'ScottKirvan/QuKi-Notes',
    });
  });

  test('drops entries that are not owner/repo', () => {
    assert.deepEqual(parseApps('{"a":"ScottKirvan/BojuBot","b":"no-slash","c":5,"d":"a/b/c"}'), { a: 'ScottKirvan/BojuBot' });
  });

  test('missing or broken config means no apps', () => {
    assert.deepEqual(parseApps(undefined), {});
    assert.deepEqual(parseApps('not json'), {});
    assert.deepEqual(parseApps('["ScottKirvan/BojuBot"]'), {});
  });
});

describe('parseReport', () => {
  test('accepts a complete report and trims it', () => {
    const r = parseReport({ ...valid, title: '  [BUG] Reply never arrives  ', body: '\nIt hangs.\n' }, APPS);
    assert.deepEqual(r, { ok: true, report: { ...valid, repo: 'ScottKirvan/BojuBot' } });
  });

  test('accepts every type', () => {
    for (const type of ['bug', 'feature', 'feedback']) {
      assert.equal(parseReport({ ...valid, type }, APPS).ok, true, type);
    }
  });

  test('rejects an unknown app', () => {
    assert.deepEqual(parseReport({ ...valid, app: 'other' }, APPS), { ok: false, error: 'unknown_app' });
    assert.deepEqual(parseReport({ ...valid, app: 'toString' }, APPS), { ok: false, error: 'unknown_app' });
  });

  test('rejects missing, empty or wrongly typed fields', () => {
    for (const field of ['app', 'type', 'title', 'body'] as const) {
      const missing: Record<string, unknown> = { ...valid };
      delete missing[field];
      assert.deepEqual(parseReport(missing, APPS), { ok: false, error: 'invalid_report', field }, `${field} missing`);
      assert.deepEqual(parseReport({ ...valid, [field]: 42 }, APPS), { ok: false, error: 'invalid_report', field }, `${field} not a string`);
    }
    assert.deepEqual(parseReport({ ...valid, title: '   ' }, APPS), { ok: false, error: 'invalid_report', field: 'title' });
    assert.deepEqual(parseReport({ ...valid, body: '\n\n' }, APPS), { ok: false, error: 'invalid_report', field: 'body' });
  });

  test('rejects an unknown type', () => {
    assert.deepEqual(parseReport({ ...valid, type: 'question' }, APPS), { ok: false, error: 'invalid_report', field: 'type' });
  });

  test('rejects a title or body over the limit', () => {
    assert.equal(parseReport({ ...valid, title: 'x'.repeat(TITLE_MAX) }, APPS).ok, true);
    assert.deepEqual(parseReport({ ...valid, title: 'x'.repeat(TITLE_MAX + 1) }, APPS), { ok: false, error: 'invalid_report', field: 'title' });
    assert.equal(parseReport({ ...valid, body: 'x'.repeat(BODY_MAX) }, APPS).ok, true);
    assert.deepEqual(parseReport({ ...valid, body: 'x'.repeat(BODY_MAX + 1) }, APPS), { ok: false, error: 'invalid_report', field: 'body' });
  });

  test('rejects a title with line breaks', () => {
    assert.deepEqual(parseReport({ ...valid, title: 'one\ntwo' }, APPS), { ok: false, error: 'invalid_report', field: 'title' });
  });

  test('rejects anything that is not an object', () => {
    for (const v of [null, 'text', 3, ['bojubot']]) {
      assert.deepEqual(parseReport(v, APPS), { ok: false, error: 'invalid_report' });
    }
  });

  test('ignores extra fields, including an email address', () => {
    const r = parseReport({ ...valid, email: 'someone@example.com' }, APPS);
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(r).includes('example.com'), false);
  });
});

describe('buildIssue', () => {
  const report = { app: 'bojubot', type: 'bug' as const, title: '[BUG] Reply never arrives', body: 'It hangs.', repo: 'ScottKirvan/BojuBot' };

  test('labels bugs and feature requests by type, plus user-report', () => {
    assert.deepEqual(buildIssue(report).labels, ['user-report', 'bug']);
    assert.deepEqual(buildIssue({ ...report, type: 'feature' }).labels, ['user-report', 'enhancement']);
    assert.deepEqual(buildIssue({ ...report, type: 'feedback' }).labels, ['user-report']);
  });

  test('keeps the title and says the body came from the in-app form', () => {
    const issue = buildIssue(report);
    assert.equal(issue.title, '[BUG] Reply never arrives');
    assert.equal(issue.body, 'It hangs.\n\n---\n_Sent from the in-app report form in bojubot._');
  });

  test('the longest allowed body still fits GitHub\'s limit with the footer', () => {
    assert.ok(buildIssue({ ...report, body: 'x'.repeat(BODY_MAX) }).body.length <= 65536);
  });
});
