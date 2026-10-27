# API

For apps that send reports to the relay.

The relay's address is `https://report.scottkirvan.com`.

## `POST /report`

Send JSON with a `content-type: application/json` header:

| Field | Type | Rules |
|---|---|---|
| `app` | string | The app's name, which must be listed in the relay's `APPS` (for example `bojubot`). It sets which repo the issue goes to. |
| `type` | string | `bug`, `feature` or `feedback` |
| `title` | string | The issue title, one line, up to 256 characters. Use the repo's title prefixes (`[BUG]`, `[FEATURE]`, `[GENERAL]`). |
| `body` | string | The issue body in Markdown, up to 65,000 characters |

Surrounding whitespace is trimmed. Empty fields are rejected. Any other field is ignored and never reaches the issue.

The whole request may be up to 256 KB.

### The issue

The relay files a **public** issue on the app's repo, as the GitHub App:

- **Title:** `title` as sent.
- **Body:** `body`, followed by a line saying it was sent from the app's in-app report form.
- **Labels:** `user-report`, plus `bug` for `bug` or `enhancement` for `feature`.

### Success

`201`, with the issue's link and number:

```json
{ "url": "https://github.com/ScottKirvan/BojuBot/issues/500", "number": 500 }
```

### Errors

Every error is JSON, `{ "error": "<code>" }`, plus `field` for `invalid_report`.

| Status | `error` | Meaning | What the app should do |
|---|---|---|---|
| 400 | `invalid_json` | The body isn't JSON | Fix the app |
| 400 | `invalid_report` | A field is missing, empty, too long or the wrong type; `field` names it | Fix the app, or tell the user what to shorten |
| 400 | `unknown_app` | `app` isn't in the relay's `APPS` | Fix the app or the relay config |
| 404 | `not_found` | Not `/report` | Fix the app |
| 405 | `method_not_allowed` | Not `POST` | Fix the app |
| 413 | `payload_too_large` | Over 256 KB | Trim the report |
| 415 | `unsupported_media_type` | Not `application/json` | Fix the app |
| 429 | `rate_limited` | Too many reports in the last minute | Offer the fallbacks |
| 502 | `upstream_error` | GitHub refused or failed | Offer the fallbacks |
| 503 | `disabled` | Filing is turned off | Offer the fallbacks |
| 503 | `not_configured` | The relay is missing its GitHub App settings | Offer the fallbacks |
| 500 | `internal_error` | Anything else | Offer the fallbacks |

The fallbacks are what the app does without the relay: open a pre-filled GitHub issue in the browser, and copy the report to the clipboard. An app should always keep them, so a report is never lost.

## Limits

Each Cloudflare location counts separately, and the counts are approximate.

- **Per IP address:** 3 reports a minute. People behind one address (an office, a school) share it.
- **Overall:** 20 reports a minute.

[Proposed — unconfirmed] These numbers are a starting point for low traffic and can be changed in `wrangler.jsonc`.

## Privacy

The relay keeps nothing. It doesn't store reports, doesn't log their content or IP addresses, and has Cloudflare's Workers logs turned off. When something fails, the only thing it logs is which GitHub step failed and its status code. What's in the issue is public, under GitHub's privacy policy.

Cloudflare itself sees each request as it passes through, as for any website on Cloudflare; see [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).
