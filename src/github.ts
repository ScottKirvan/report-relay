import type { Issue } from './report.ts';

export interface GitHubApp {
  clientId: string;
  privateKey: string;
}

export interface FiledIssue {
  url: string;
  number: number;
}

export interface GitHubDeps {
  fetch: typeof fetch;
  now: number;
}

export type GitHubStep = 'installation' | 'token' | 'issue';

export class GitHubError extends Error {
  constructor(readonly step: GitHubStep, readonly status: number) {
    super(`GitHub ${step} request failed with status ${status}`);
  }
}

const API = 'https://api.github.com';

export async function fileIssue(repo: string, issue: Issue, app: GitHubApp, deps: GitHubDeps): Promise<FiledIssue> {
  const jwt = await createAppJwt(app.clientId, app.privateKey, deps.now);

  const installation = await call(deps, 'installation', `/repos/${repo}/installation`, jwt);
  const installationId = installation.id;
  if (typeof installationId !== 'number') throw new GitHubError('installation', 200);

  // The token is limited to this one repo and to issues, whatever else the App can do.
  const repoName = repo.split('/')[1]!;
  const access = await call(deps, 'token', `/app/installations/${installationId}/access_tokens`, jwt, {
    repositories: [repoName],
    permissions: { issues: 'write' },
  });
  const token = access.token;
  if (typeof token !== 'string') throw new GitHubError('token', 201);

  const created = await call(deps, 'issue', `/repos/${repo}/issues`, token, issue);
  const url = created.html_url;
  const number = created.number;
  if (typeof url !== 'string' || typeof number !== 'number') throw new GitHubError('issue', 201);
  return { url, number };
}

async function call(
  deps: GitHubDeps,
  step: GitHubStep,
  path: string,
  bearer: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const response = await deps.fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${bearer}`,
      'user-agent': 'report-relay',
      'x-github-api-version': '2022-11-28',
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new GitHubError(step, response.status);
  const json: unknown = await response.json().catch(() => undefined);
  if (typeof json !== 'object' || json === null) throw new GitHubError(step, response.status);
  return json as Record<string, unknown>;
}

export async function createAppJwt(clientId: string, privateKeyPem: string, now: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  // GitHub allows at most 10 minutes and advises backdating iat for clock drift.
  const seconds = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: clientId }));
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

// GitHub downloads App keys as PKCS#1 ("BEGIN RSA PRIVATE KEY"); Web Crypto only imports PKCS#8.
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const match = /^-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (RSA )?PRIVATE KEY-----$/.exec(normalized);
  if (!match || match[1] !== match[3]) throw new Error('GITHUB_APP_PRIVATE_KEY is not a PEM private key');
  const der = Uint8Array.from(atob(match[2]!.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  return match[1] ? wrapPkcs1(der) : der;
}

const RSA_ALGORITHM_IDENTIFIER = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];

function wrapPkcs1(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = [0x02, 0x01, 0x00];
  const octetString = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  const content = [...version, ...RSA_ALGORITHM_IDENTIFIER, ...octetString];
  return Uint8Array.from([0x30, ...derLength(content.length), ...content]);
}

function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let n = length; n > 0; n >>= 8) bytes.unshift(n & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
