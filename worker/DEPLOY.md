# Keeper Trade AI Worker — owner setup

The Worker holds the Anthropic key. Never paste the key into chat, HTML, JavaScript, `wrangler.toml`, or this repository.

## In Kimi Code: one screen at a time

Ask the owner to complete each numbered screen, then wait for **“done”** before moving to the next. Do not request the key.

**Python option:** If Node.js is unavailable, use `PYTHON-DEPLOY.md` instead. It deploys the same Worker through Cloudflare's API using Python's standard library, without Node.js or Wrangler.

## 1. Create the Anthropic key (owner only)

1. Open `https://console.anthropic.com/` and sign in.
2. Open **API keys** and create a key.
3. Keep it in the Anthropic tab or the owner's password manager for the next terminal step.
4. Do not paste it into chat.

## 2. Open Cloudflare Workers

1. Open `https://dash.cloudflare.com/` and sign in.
2. Open **Workers & Pages** and confirm a Workers account is available.
3. Keep this tab open.

## 3. Prepare the Worker folder

Use the `worker` folder supplied with this project. Deploy it separately from the static website. The only required tools are Node.js and Wrangler. No site build or npm dependency is involved.

First run `node --version` in a terminal. If it says `node: command not found`, install the current **Node.js LTS** from `https://nodejs.org/`, then close and reopen the terminal. `npx` is included with Node.js.

Open a terminal in this folder and run:

```sh
npx wrangler login
```

Complete the Cloudflare screen in the browser. The owner performs this step.

## 4. Create the two KV namespaces

Run each command separately and copy the generated IDs into `wrangler.toml`:

```sh
npx wrangler kv namespace create AI_USAGE
npx wrangler kv namespace create AI_CACHE
```

- `AI_USAGE`: rate limits, daily spend, and request logs.
- `AI_CACHE`: cached feature responses.

## 5. Lock the public origin and budget

In `wrangler.toml`, set:

```toml
ALLOWED_ORIGIN = "https://YOUR-GITHUB-USERNAME.github.io"
DAILY_SPEND_CAP = "1.00"
ANTHROPIC_WORKSPACE_ID = "wrkspc_YOUR_WORKSPACE_ID"
```

Use the exact public site origin, without a path or trailing slash. If the site has a custom domain, use that exact origin. For an Anthropic user API key, copy the workspace ID from **Claude Console → Settings → Workspaces**; the ID is not a secret. Workspace-scoped keys can leave `ANTHROPIC_WORKSPACE_ID` empty.

## 6. Store the secret (owner types this)

In the terminal, run:

```sh
npx wrangler secret put ANTHROPIC_API_KEY
```

When Wrangler prompts, the owner enters the Anthropic key directly. Do not paste it into chat or a file.

## 7. Deploy

```sh
npx wrangler deploy
```

The resulting URL should look like `https://keeper-trade-ai.YOUR-SUBDOMAIN.workers.dev`.

## 8. Verify the public stats route

Open this URL in a browser:

```text
https://keeper-trade-ai.YOUR-SUBDOMAIN.workers.dev/ai/stats
```

Expected JSON:

```json
{"date":"YYYY-MM-DD","spend":0,"cap":1,"currency":"USD"}
```

If the response says `Origin not allowed`, that check is working. Browser requests must come from the configured site origin.

## 9. Connect the static site

On the Keeper Trade homepage, open **AI setup** in the roast/hype lab. Paste only the Worker base URL, for example:

```text
https://keeper-trade-ai.YOUR-SUBDOMAIN.workers.dev
```

Do not include `/ai` and do not include any key.

## Exact Anthropic Messages API request used by the Worker

The Worker sends this shape to `https://api.anthropic.com/v1/messages`:

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 60,
  "system": [
    {
      "type": "text",
      "text": "SERVER-SIDE SYSTEM PROMPT",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [
    { "role": "user", "content": "JSON-SERIALIZED FEATURE PAYLOAD" }
  ]
}
```

Required headers:

```text
Content-Type: application/json
x-api-key: WORKER_SECRET_AT_RUNTIME
anthropic-version: 2023-06-01
anthropic-beta: prompt-caching-2024-07-31
anthropic-workspace-id: WORKSPACE_ID_WHEN_REQUIRED
```

`gm-brain` and `newsletter` route to Sonnet; creative/cached features use Haiku. Roast cards are capped at 60 output tokens.

## Safety checks after the first real card

- Open `/ai/stats` again and confirm spend is reported.
- Generate the same card twice; the second response should be cached.
- Check the Cloudflare logs for feature/token/cost entries.
- To stop AI immediately, raise no key or client code: remove the Worker URL locally or pause the Worker in Cloudflare. Existing site features continue working.
