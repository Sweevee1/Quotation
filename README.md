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

Twitch requires that production redirect URI to be `https://` — it rejects `http://` outright for anything but literal `localhost`. If you're not putting this behind a reverse proxy (e.g. a typical Unraid install reached directly by LAN IP), see **HTTPS for Twitch OAuth without a reverse proxy** below before registering the URL.

## 2. Create a dedicated bot account

Use a second Twitch account (not your main channel) so chat messages are clearly the bot. **Make that bot account a Moderator on your channel** — this is required for the live Follower-permission check to work (`moderator:read:followers`).

## HTTPS for Twitch OAuth without a reverse proxy

Twitch's OAuth redirect URI must be `https://` for anything but literal `localhost` — there's no way around this on Twitch's end. If you already have a reverse-proxy domain with a real certificate in front of this app, just set `PUBLIC_URL` to that and register its `https://.../twitch/callback` — you don't need anything below.

If you don't (e.g. you reach this app directly at `http://<unraid-ip>:8766`, the common case), set the `TLS_PORT` variable (e.g. `8767`) — the server then also listens on that port with a self-signed certificate it generates and persists to `DATA_DIR` on first boot, solely so the OAuth callback can be HTTPS. Then:

1. Expose that port too: on Unraid, add another **Port** mapping, Container `8767` → Host `8767` (or any free port); in Docker Compose, uncomment the matching lines in `docker-compose.yml`.
2. Set `PUBLIC_URL=https://<your-server-address>:8767`.
3. Register `https://<your-server-address>:8767/twitch/callback` as the Twitch redirect URI (not `8766` — that port stays plain HTTP).
4. The first time you click **Connect with Twitch**, the popup will briefly hit that HTTPS port and your browser will show an untrusted-certificate warning (expected — it's self-signed) — click through it (Chrome: **Advanced → Proceed**). You only need to do this once; the cert is reused after that. You keep using `http://<your-server-address>:8766` for the WebUI itself day-to-day.

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
   | `PUBLIC_URL` | your externally-reachable `https://` address if you're putting this behind a reverse proxy, e.g. `https://quotation.yourdomain.com` — otherwise, see **HTTPS for Twitch OAuth without a reverse proxy** above |
   | `TLS_PORT` | only if you followed the section above without a reverse proxy, e.g. `8767` — otherwise omit |
   | `PUBLIC_PORT` | optional, e.g. `8768`: a second port that serves only the public quotes page (see "Public quotes page" below) |
4. Apply, then open `http://<your-unraid-ip>:8766`, log in with `WEBUI_PASSWORD`, enter your channel name plus the Twitch Client ID/Secret from step 1 in Settings and save, then go to the Dashboard and click **Connect with Twitch**.

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

### Security notes

- Never forward or tunnel ports `8766`/`8767` (admin WebUI) to the internet. If you expose anything, expose only the public quotes page port (`PUBLIC_PORT`).
- `docker-compose.yml` binds to `127.0.0.1` by default; edit the port mappings for LAN access.
- Images are also tagged by commit SHA (`ghcr.io/sweevee1/quotation:<sha>`); pull that tag instead of `latest` if you want a pinned version.
- Back up `./data` (the SQLite database); the container runs as uid 99:100 and fixes ownership of that folder on start.

## Running from source (development)

```
npm install
npm run dev
```

Open http://localhost:5173, log in with `WEBUI_PASSWORD`, enter your channel name and Twitch Client ID/Secret in Settings, then go to the Dashboard and click **Connect with Twitch** to authorize the bot account.

## Public quotes page and linking to SweevElements

Viewers can browse every quote (and see exactly what `!quote 64` will say) in one of two ways. Both only ever show the quote number, text, author, game and date, never who added it.

**Linked to SweevElements (like Prowlarr to Radarr).** In Quotation open **Settings, Integrations & public page** and generate an API key (shown once, only its hash is stored). In SweevElements open **Settings, Quotation** and enter this app's address (as SweevElements can reach it, for example `http://192.168.1.10:8766`) plus the key. SweevElements checks the key, then serves the list at `https://<your-sweevelements>/<channel>/quotes`, next to the tip page and in its look. SweevElements pulls from Quotation server-side, so Quotation does not need to be reachable from the internet.

**Quotation on its own.** Switch on **Publish a read-only list of quotes** in the same panel. The page is `/public/quotes` (also `/public/quotes/64`), in Quotation's own look. It is off by default. To publish it without exposing the admin login, set `PUBLIC_PORT` (for example `8768`) and map that port too, then forward or tunnel only that port: it serves nothing except the public page.

Machine API used by the link (Bearer or `X-Api-Key`): `GET /api/integration/v1/ping`, `/quotes?page=&pageSize=&search=`, `/quotes/:id`. Check script: `node --import tsx server/scripts/integration-check.ts` from `server/`.

## Permission tiers

`everyone < follower < subscriber < vip < moderator < broadcaster`. Each command's minimum tier, aliases, cooldowns, and response template are editable per-command in Settings without restarting the bot.
