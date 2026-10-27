# Setting up the relay

This is everything needed to get the relay running, once. It takes about half an hour. You need:

- a GitHub account that owns the app repos (here, `ScottKirvan`)
- the [Cloudflare](https://dash.cloudflare.com/) account that holds the `scottkirvan.com` zone (its nameservers are already Cloudflare's)
- Node.js and this repo cloned locally (step 4 runs `npm install` in it)

Nothing here costs money. The Workers free plan allows 100,000 requests a day.

## 1. Create the GitHub App

The relay files issues as a GitHub App. The App can only reach the repos you install it on, and only their issues.

1. Open [github.com/settings/apps/new](https://github.com/settings/apps/new).
2. Fill in:
   - **GitHub App name:** the name shown as the issue author, with `[bot]` after it. It must be unique on GitHub, for example `Scott Kirvan Reports`.
   - **Homepage URL:** `https://github.com/ScottKirvan/report-relay`
   - **Webhook:** untick **Active**. The relay doesn't need events.
3. Under **Permissions → Repository permissions**, set **Issues** to **Read and write**. Leave everything else at **No access** (GitHub adds **Metadata: Read-only** by itself).
4. Under **Where can this GitHub App be installed?**, choose **Only on this account**.
5. Click **Create GitHub App**.
6. On the App's page, copy the **Client ID** (it starts with `Iv`). You need it in step 4.
7. Further down, under **Private keys**, click **Generate a private key**. Your browser downloads a `.pem` file. Keep it somewhere safe and out of any repo: anyone with this file can file issues as the App.

## 2. Install the App on the app repos

1. On the App's page, click **Install App**, then **Install** next to your account.
2. Choose **Only select repositories** and pick each repo that reports go to (`BojuBot`). Also pick `report-relay` itself, so you can test the relay without filing on a real app's repo (see step 7).
3. Click **Install**.

To add another app later, come back here (**Settings → Applications → Installed GitHub Apps → Configure**) and add its repo.

## 3. Add the `user-report` label

Every report gets the `user-report` label, plus `bug` or `enhancement` from its type. GitHub repos have `bug` and `enhancement` already. Add `user-report` to each repo:

```sh
gh label create user-report -R ScottKirvan/BojuBot --color FBCA04 --description "Filed from an in-app report form"
gh label create user-report -R ScottKirvan/report-relay --color FBCA04 --description "Filed from an in-app report form"
```

## 4. Configure the Worker

The Worker's settings are in `wrangler.jsonc`, at the top level of this repo (next to `package.json`). Open it in your local clone and find the `vars` block (shown here without its comments):

```jsonc
"vars": {
  "FILING_ENABLED": "true",
  "APPS": "{\"bojubot\":\"ScottKirvan/BojuBot\"}",
  "GITHUB_APP_CLIENT_ID": ""
},
```

1. Put the Client ID from step 1 between the quotes of `GITHUB_APP_CLIENT_ID`, for example `"GITHUB_APP_CLIENT_ID": "Iv23liAbCdEf123456"`. It isn't secret, so it's fine to commit (on a branch, through a PR).
2. `APPS` maps each app name to the repo its reports go to. Its value is JSON written inside a string, so every inner quote has a backslash before it. While you test, add the relay's own repo so the line reads:

   ```jsonc
   "APPS": "{\"bojubot\":\"ScottKirvan/BojuBot\",\"report-relay\":\"ScottKirvan/report-relay\"}",
   ```

   Put it back to the original line afterwards if you like. If `APPS` isn't valid, the relay answers `unknown_app` for every app.
3. Save the file. The deploy in step 6 reads it from your clone, so the change doesn't have to be committed first.
4. In a terminal in your clone, install the dependencies, which include Wrangler, Cloudflare's tool for the steps below:

   ```sh
   npm install
   ```

   Without it, `npm run deploy` in step 6 fails with "'wrangler' is not recognized". (`npx wrangler` commands still work without it, because `npx` downloads a temporary copy, so the failure only shows up at the deploy.) Run it again after pulling changes to `package.json`.

5. Sign in to Cloudflare with the account that holds `scottkirvan.com`:

   ```sh
   npx wrangler login
   ```

6. Store the private key as a Worker secret. It's stored encrypted in Cloudflare and never appears in the repo. In PowerShell:

   ```powershell
   Get-Content C:\path\to\your-app.private-key.pem -Raw | npx wrangler secret put GITHUB_APP_PRIVATE_KEY
   ```

   In a POSIX shell: `npx wrangler secret put GITHUB_APP_PRIVATE_KEY < /path/to/your-app.private-key.pem`

   The key can stay in the format GitHub downloads (`BEGIN RSA PRIVATE KEY`); the relay converts it.

   The first time, Wrangler may say the Worker doesn't exist yet and offer to create it. Say yes.

## 5. Check the address is free

The relay's address is `report.scottkirvan.com`, set in `wrangler.jsonc` under `routes`. The deploy creates its DNS record and HTTPS certificate for you, but Cloudflare refuses if that name already has a CNAME record.

In the Cloudflare dashboard, open `scottkirvan.com` → **DNS** → **Records** and search for `report`. If a record exists, delete it (or pick another name in `wrangler.jsonc` before the first deploy: the apps build the address in, so changing it later means an app release).

## 6. Deploy

```sh
npm run deploy
```

Wrangler lists `report.scottkirvan.com (custom domain)` under the deployed triggers. The first time, the certificate can take a few minutes; until then HTTPS requests may fail.

In the dashboard you can now see a DNS record for `report` of type **Worker**, and under **Workers & Pages** → `report-relay` → **Settings** → **Domains & Routes**, the custom domain. The Worker has no `workers.dev` address: `report.scottkirvan.com` is the only way in.

## 7. Test it

Send a test report to the relay's own repo (this needs the `report-relay` entry from step 4.2):

```powershell
$report = "$env:TEMP\relay-test.json"
'{"app":"report-relay","type":"feedback","title":"[GENERAL] Relay test","body":"Testing the relay."}' | Set-Content $report
curl.exe -X POST https://report.scottkirvan.com/report -H "content-type: application/json" --data-binary "@$report"
```

The report goes through a file because PowerShell versions disagree on how to pass quotes to `curl.exe`: an inline `-d '{\"app\":…}'` works in Windows PowerShell 5.1 but reaches the relay as `invalid_json` from PowerShell 7.3 on. `curl.exe` also prints the relay's error code when it fails, which `Invoke-RestMethod` hides on 5.1.

In a POSIX shell:

```sh
curl -X POST https://report.scottkirvan.com/report -H "content-type: application/json" \
  -d '{"app":"report-relay","type":"feedback","title":"[GENERAL] Relay test","body":"Testing the relay."}'
```

A working relay answers `201` with the new issue's `url`. Open it: the author is your App, and it has the `user-report` label. Close the issue when you're done.

If it fails, the error code says which part to check (see [API](./api.md#errors)). `not_configured` means the client ID or the secret is missing. `upstream_error` means GitHub refused: check that the App is installed on that repo and has **Issues: Read and write**.

## Turning filing off

If spam arrives, or anything goes wrong, turn filing off. The apps then show their own fallbacks (**Open on GitHub** and **Copy report**), so no report is lost.

- **Quickest:** Cloudflare dashboard → **Workers & Pages** → `report-relay` → **Settings** → **Variables and Secrets** → set `FILING_ENABLED` to `false` → **Deploy**. Note that the next `npm run deploy` puts back the value in `wrangler.jsonc`.
- **Lasting:** set `"FILING_ENABLED": "false"` in `wrangler.jsonc` and run `npm run deploy`.

To stop the App filing anything at all, suspend or uninstall it under **Settings → Applications → Installed GitHub Apps**.

## Removing the relay

`npx wrangler delete` removes the Worker and its custom domain. Cloudflare keeps the certificate it issued; delete it under `scottkirvan.com` → **SSL/TLS** → **Edge Certificates** if you like.

## Rotating the key

Generate a new private key on the App's page, run step 4.6 again with the new file, then delete the old key on the App's page.
