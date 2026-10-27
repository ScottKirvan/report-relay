import { handle, type Env } from './handler.ts';
import { fileIssue } from './github.ts';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, {
      fileIssue: (repo, issue, app) => fileIssue(repo, issue, app, { fetch: (input, init) => fetch(input, init), now: Date.now() }),
    });
  },
};
