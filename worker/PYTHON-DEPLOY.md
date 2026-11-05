# Python deployment path (no Node.js)

Use `deploy.py` with Python's standard library. It creates the two KV namespaces, uploads `worker.js`, applies bindings/origin/budget settings, and uploads the Anthropic key as a Worker secret. The key is requested with a hidden `getpass` prompt and is never saved by the script.

## One screen at a time in Kimi Code

Wait for the owner to complete each screen before continuing. Do not request credentials in chat.

## 1. Create a scoped Cloudflare API token

In Cloudflare, open **My Profile → API Tokens → Create Token**. Use a custom token scoped to the one account:

- **Workers Scripts → Edit**
- **Workers KV Storage → Edit**
- **Account → the account that will host the Worker**

Create the token and keep it private.

## 2. Find the account ID and public site origin

- The Cloudflare account ID appears in the Workers account/dashboard details.
- The public origin is the exact GitHub Pages/custom-domain origin, such as `https://username.github.io`, with no path or trailing slash.

Do not include a path such as `/keeper-trade` in `ALLOWED_ORIGIN`.

## 3. Open a local terminal in the worker folder

Set credentials only for that terminal session. PowerShell example:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = Read-Host "Cloudflare account ID"
$env:CLOUDFLARE_API_TOKEN = Read-Host "Cloudflare API token"
```

Do not paste either value into chat. The token remains a local environment variable for this terminal only. Clear it later with:

```powershell
Remove-Item Env:CLOUDFLARE_API_TOKEN
```

## 4. Run the deployer

From the `worker` folder:

```powershell
python deploy.py --origin "https://YOUR-GITHUB-USERNAME.github.io"
```

The script will:

1. Create `keeper-trade-ai-usage` and `keeper-trade-ai-cache` if their IDs are placeholders.
2. Save only those public KV IDs in `wrangler.toml`.
3. Ask for confirmation before changing Cloudflare.
4. Prompt for the Anthropic key with hidden input.
5. Upload the Worker and secret without saving the key.

## 5. Verify and connect

Open the deployed Worker's `/ai/stats` endpoint. It should return today's spend, cap, and USD currency.

Then paste only the Worker's base URL into **AI setup** on the Keeper Trade homepage. Do not include `/ai` and never include an API key.
