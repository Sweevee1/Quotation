# Quotation

Self-hosted Twitch chat quote bot with a WebUI, letting mods and viewers save and recall memorable chat moments.

Commands: `!addquote <text>`, `!quote [id]`, `!editquote <id> <text>`, `!removequote <id>` (alias `!delquote`). Each quote captures the text, an attributed author, the game/category live at creation time, and a sequential ID — configurable per-command permissions, cooldowns, aliases, and response format live in the WebUI Settings page.

Whichever way you install it, you'll need to do these two steps once, first:

## 1. Register a Twitch app

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → **Register Your Application**.
2. Category: **Chat Bot**.
3. OAuth Redirect URLs — add both:
   - `http://localhost:8766/twitch/auth` (local dev)
   - `https://<your-server-address>:8766/twitch/callback` (production — must match scheme/host/port exactly; on Unraid this is your server's LAN IP or reverse-proxy domain)
4. Save the **Client ID** and generate a **Client Secret** — you'll paste both into the WebUI Settings page later.

If Twitch ever reports `redirect_mismatch`, it redirects the error to whatever URI *is* registered — check where the browser lands to see the mismatch, then fix either the console entry or `PUBLIC_URL`.

## 2. Create a dedicated bot account

Use a second Twitch account (not your main channel) so chat messages are clearly the bot. **Make that bot account a Moderator on your channel** — this is required for the live Follower-permission check to work (`moderator:read:followers`).

## Installing on Unraid

A pre-built image is published to GHCR on every push: `ghcr.io/sweevee1/quotation:latest`.

1. In the Unraid **Docker** tab, click **Add Container**.
2. Fill in:
   | Field | Value |
   |---|---|
   | Name | `quotation` |
   | Repository | `ghcr.io/sweevee1/quotation:latest` |
   | Network Type | `Bridge` |
   | Port | Container `8766` → Host `8766` (or any free host port) |
   | Path | Container `/app/data` → Host `/mnt/user/appdata/quotation` |
3. Add these as **Variables**:
   | Variable | Value |
   |---|---|
   | `WEBUI_PASSWORD` | any password — only seeds the WebUI login on first run, change it from Settings afterward |
   | `SESSION_SECRET` | any long random string (e.g. generate one with `openssl rand -hex 32`) |
   | `PUBLIC_URL` | your externally-reachable `https://` address, e.g. `https://quotation.yourdomain.com`, if you're putting this behind a reverse proxy — otherwise omit |
4. Apply, then open `http://<your-unraid-ip>:8766`, log in with `WEBUI_PASSWORD`, and in Settings enter your channel name plus the Twitch Client ID/Secret from step 1, then click **Connect with Twitch**.

The SQLite database lives at `/mnt/user/appdata/quotation/quotation.db` on the host, so it survives container updates/recreation.

If `ghcr.io/sweevee1/quotation:latest` fails to pull with a permission/authentication error, the GHCR package may still be private — no login is needed once it's public (this is a one-time setting on the GitHub side, not something you need to change).

## Installing anywhere else with Docker Compose

```
git clone https://github.com/Sweevee1/quotation.git
cd quotation
cp .env.example .env
```

Fill in `.env` (see the table above for what each value means), then:

```
docker compose build
docker compose up -d
```

Serves the WebUI + bot on port `8766`, with the SQLite database persisted to `./data`.

## Running from source (development)

```
npm install
npm run dev
```

Open http://localhost:5173, log in with `WEBUI_PASSWORD`, then in Settings enter your channel name, Twitch Client ID/Secret, and click **Connect with Twitch** to authorize the bot account.

## Permission tiers

`everyone < follower < subscriber < vip < moderator < broadcaster`. Each command's minimum tier, aliases, cooldowns, and response template are editable per-command in Settings without restarting the bot.
