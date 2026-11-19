# Quotation

Self-hosted Twitch chat quote bot with a WebUI, letting mods and viewers save and recall memorable chat moments.

Commands: `!addquote <text>`, `!quote [id]`, `!editquote <id> <text>`, `!removequote <id>` (alias `!delquote`). Each quote captures the text, an attributed author, the game/category live at creation time, and a sequential ID — configurable per-command permissions, cooldowns, aliases, and response format live in the WebUI Settings page.

Whichever way you install it, you'll need to do these two steps once, first:

## 1. Register a Twitch app

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → **Register Your Application**.
2. Category: **Chat Bot**.
3. OAuth Redirect URL: `https://YOUR-DOMAIN/twitch/callback`, where `YOUR-DOMAIN` is the HTTPS address you reach Quotation on (for example through a Cloudflare Tunnel). Twitch rejects plain `http://` addresses, except `http://localhost:8766/twitch/callback` for local use.
4. Save the **Client ID** and generate a **Client Secret**. You'll paste both into the WebUI Settings page later.

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
No variables are needed.

3. Apply, then open `http://<your-unraid-ip>:8766`. On first visit, create your WebUI password. In Settings enter your channel name plus the Twitch Client ID/Secret from step 1 and save, then open the Dashboard and click **Connect with Twitch**. Do that last step from your HTTPS address (the one registered with Twitch), not the LAN IP.

The SQLite database lives at `/mnt/user/appdata/quotation/quotation.db` on the host, so it survives container updates/recreation.

If `ghcr.io/sweevee1/quotation:latest` fails to pull with a permission/authentication error, the GHCR package may still be private — no login is needed once it's public (this is a one-time setting on the GitHub side, not something you need to change).

## Installing anywhere else with Docker Compose

```
git clone https://github.com/Sweevee1/quotation.git
cd quotation
```

No `.env` values are required. Then:

```
docker compose up -d
```

Serves the WebUI + bot on port `8766`, with the SQLite database persisted to `./data`.

### Security notes

- Don't port-forward `8766` on your router. Publish it through a Cloudflare Tunnel (add Cloudflare Access in front of the admin if you can; the public quotes page lives at `/public/quotes*`, so allow that path through).
- `docker-compose.yml` binds to `127.0.0.1` by default; edit the port mappings for LAN access.
- Images are also tagged by commit SHA (`ghcr.io/sweevee1/quotation:<sha>`); pull that tag instead of `latest` if you want a pinned version.
- Back up `./data` (the SQLite database); the container runs as uid 99:100 and fixes ownership of that folder on start.

## Running from source (development)

```
npm install
npm run dev
```

Open http://localhost:5173, create your password, enter your channel name and Twitch Client ID/Secret in Settings, then go to the Dashboard and click **Connect with Twitch** to authorize the bot account.

## Public quotes page and linking to SweevElements

Viewers can browse every quote (and see exactly what `!quote 64` will say) in one of two ways. Both only ever show the quote number, text, author, game and date, never who added it.

**Linked to SweevElements (like Prowlarr to Radarr).** In Quotation open **Settings, Integrations & public page** and generate an API key (shown once, only its hash is stored). In SweevElements open **Settings, Quotation** and enter this app's address (as SweevElements can reach it, for example `http://192.168.1.10:8766`) plus the key. SweevElements checks the key, then serves the list at `https://<your-sweevelements>/<channel>/quotes`, next to the tip page and in its look. SweevElements pulls from Quotation server-side, so Quotation does not need to be reachable from the internet.

**Quotation on its own.** Switch on **Publish a read-only list of quotes** in the same panel. The page is `/public/quotes` (also `/public/quotes/64`), in Quotation's own look. It is off by default. It works on the same address as the WebUI.

Machine API used by the link (Bearer or `X-Api-Key`): `GET /api/integration/v1/ping`, `/quotes?page=&pageSize=&search=`, `/quotes/:id`. Check script: `node --import tsx server/scripts/integration-check.ts` from `server/`.

## Permission tiers

`everyone < follower < subscriber < vip < moderator < broadcaster`. Each command's minimum tier, aliases, cooldowns, and response template are editable per-command in Settings without restarting the bot.
