import { buildIssue, parseApps, parseReport, type Issue } from './report.ts';
import { GitHubError, type FiledIssue } from './github.ts';

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  APPS?: string;
  FILING_ENABLED?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  PER_IP_LIMIT: RateLimiter;
  ALL_LIMIT: RateLimiter;
}

export interface Filer {
  fileIssue(repo: string, issue: Issue, app: { clientId: string; privateKey: string }): Promise<FiledIssue>;
}

export const MAX_REQUEST_BYTES = 256 * 1024;

export async function handle(request: Request, env: Env, filer: Filer): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/report') return error(404, 'not_found');
  if (request.method !== 'POST') return error(405, 'method_not_allowed', { allow: 'POST' });
  if (env.FILING_ENABLED !== 'true') return error(503, 'disabled');

  // Rate limits run before the body is read, so junk requests count too.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!(await env.PER_IP_LIMIT.limit({ key: ip })).success) return error(429, 'rate_limited');
  if (!(await env.ALL_LIMIT.limit({ key: 'all' })).success) return error(429, 'rate_limited');

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.split(';')[0]!.trim().toLowerCase() !== 'application/json') {
    return error(415, 'unsupported_media_type');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_REQUEST_BYTES) return error(413, 'payload_too_large');
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_REQUEST_BYTES) return error(413, 'payload_too_large');

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return error(400, 'invalid_json');
  }

  const parsed = parseReport(value, parseApps(env.APPS));
  if (!parsed.ok) {
    return 'field' in parsed && parsed.field
      ? json(400, { error: parsed.error, field: parsed.field })
      : error(400, parsed.error);
  }

  const clientId = env.GITHUB_APP_CLIENT_ID;
  const privateKey = env.GITHUB_APP_PRIVATE_KEY;
  if (!clientId || !privateKey) return error(503, 'not_configured');

  try {
    const filed = await filer.fileIssue(parsed.report.repo, buildIssue(parsed.report), { clientId, privateKey });
    return json(201, { url: filed.url, number: filed.number });
  } catch (e) {
    // Never log report content: only which GitHub call failed and its status.
    if (e instanceof GitHubError) {
      console.error('github_error', e.step, e.status);
      return error(502, 'upstream_error');
    }
    console.error('internal_error');
    return error(500, 'internal_error');
  }
}

function error(status: number, code: string, headers: Record<string, string> = {}): Response {
  return json(status, { error: code }, headers);
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}
