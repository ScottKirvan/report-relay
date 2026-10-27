export type ReportType = 'bug' | 'feature' | 'feedback';

export interface Report {
  app: string;
  type: ReportType;
  title: string;
  body: string;
  repo: string;
}

export interface Issue {
  title: string;
  body: string;
  labels: string[];
}

export type AppRepos = Record<string, string>;

export type ParseResult =
  | { ok: true; report: Report }
  | { ok: false; error: 'unknown_app' }
  | { ok: false; error: 'invalid_report'; field?: keyof Omit<Report, 'repo'> };

export const TITLE_MAX = 256;
// GitHub caps an issue body at 65536 characters; this leaves room for the footer.
export const BODY_MAX = 65000;

const TYPES: readonly ReportType[] = ['bug', 'feature', 'feedback'];
const TYPE_LABELS: Record<ReportType, string[]> = {
  bug: ['bug'],
  feature: ['enhancement'],
  feedback: [],
};
const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export function parseApps(json: string | undefined): AppRepos {
  if (!json) return {};
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return {};
  }
  if (!isRecord(value)) return {};
  const apps: AppRepos = {};
  for (const [app, repo] of Object.entries(value)) {
    if (typeof repo === 'string' && REPO_PATTERN.test(repo)) apps[app] = repo;
  }
  return apps;
}

export function parseReport(value: unknown, apps: AppRepos): ParseResult {
  if (!isRecord(value)) return { ok: false, error: 'invalid_report' };

  const app = text(value.app);
  if (app === undefined) return { ok: false, error: 'invalid_report', field: 'app' };
  if (!Object.hasOwn(apps, app)) return { ok: false, error: 'unknown_app' };

  const type = text(value.type);
  if (type === undefined || !(TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: 'invalid_report', field: 'type' };
  }

  const title = text(value.title);
  if (title === undefined || title.length > TITLE_MAX || /[\r\n]/.test(title)) {
    return { ok: false, error: 'invalid_report', field: 'title' };
  }

  const body = text(value.body);
  if (body === undefined || body.length > BODY_MAX) return { ok: false, error: 'invalid_report', field: 'body' };

  return { ok: true, report: { app, type: type as ReportType, title, body, repo: apps[app]! } };
}

export function buildIssue(report: Report): Issue {
  return {
    title: report.title,
    body: `${report.body}\n\n---\n_Sent from the in-app report form in ${report.app}._`,
    labels: ['user-report', ...TYPE_LABELS[report.type]],
  };
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
