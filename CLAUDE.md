# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-hosted Twitch chat bot + WebUI reimplementing Streamlabs Chatbot's Quotes feature (`!addquote`,
`!quote [id]`, `!editquote`, `!removequote`), since that app is no longer maintained. The WebUI's visual
design deliberately mirrors SLCB's actual desktop UI (dark navy theme, icon sidebar, table-based data views
with toolbar icons) but with a green accent instead of SLCB's teal/amber.

npm workspaces monorepo: `shared` (types/zod schemas used by both), `server` (Express + tmi.js bot),
`web` (React/Vite WebUI). Runtime port is `8766` (both API and, in production, the built WebUI).

## Commands

```
npm install                                  # from repo root — installs all three workspaces
npm run dev                                  # runs server (tsx watch, :8766) + Vite dev server (:5173)
npm run build                                # builds shared → server → web, in that order (order matters)
npm start                                    # runs the production build: node server/dist/index.js
npm run db:generate                          # after editing server/src/db/schema.ts, generates a migration
npm run db:migrate                           # applies pending migrations manually (normally auto-run on boot)
docker compose build && docker compose up -d # production deployment, port 8766, ./data volume
```

There is no test suite and no linter configured — `tsc` (via each workspace's `build`/`dev` script) is the
only correctness check. Always run `npm run build` at the root after backend or shared-type changes; the
server's `dev` script (`tsx watch`) does *not* type-check.

**Migrations must be committed**: `server/src/db/build` script copies `src/db/migrations` into
`dist/db/migrations` — if you add a schema change, run `npm run db:generate` and commit the generated SQL
file, or production deployments will silently run without your new columns/tables.

## Deployment

Hosted at `github.com/Sweevee1/quotation` (public repo). `.github/workflows/docker.yml` builds and pushes
the Docker image to `ghcr.io/sweevee1/quotation:latest` on every push to `main` — no manual publish step.
The primary install target is Unraid (pull the GHCR image directly via the Docker tab); `README.md` has the
field-by-field container setup. `docker compose` (this repo's `docker-compose.yml`) is the alternative for
any other Docker host, building the image locally instead of pulling.

The GHCR package's visibility is a GitHub-side setting independent of the repo's — it defaults to private
even when the source repo is public, which silently breaks anonymous `docker pull` until someone flips it
to public in the package's own Settings → Danger Zone.

**Updating the live Unraid container**: it sits inside a Docker Folder named "Personal Projects" (with
`Whitelister` and `MultiplayerMarkdown`), and the collapsed folder row's `force update` link updates *every*
container in the folder — expand the folder with its chevron first and use `force update` on Quotation's own
row. The confirmation dialog reads "Update container: Quotation" when it's correctly scoped. Clicking the
container's *name* opens the edit template instead, whose `APPLY` button stays greyed out until a field
actually changes, so it can't refresh an image; the icon's context menu (WebUI / Console / Stop / Pause /
Restart / Logs / Edit / Remove) has no update entry for a container in a folder either. A successful update
can still log `Status: Image is up to date for ghcr.io/sweevee1/quotation:latest` with
`TOTAL DATA PULLED: 0 B` — that's Docker confirming the local image already matched the registry after
contacting it (the update check usually pulled it moments earlier), not a skipped pull. To verify what's
actually running, compare the container's image ID against the published manifest's config digest — they're
the same value, so they match exactly when the container is on the current build:

```
docker inspect --format '{{.Image}}' Quotation
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:sweevee1/quotation:pull&service=ghcr.io" | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
  https://ghcr.io/v2/sweevee1/quotation/manifests/latest | jq -r .config.digest
```

## Architecture

### Twitch auth is two independent token flows
- **App access token** (Client Credentials, `server/src/twitch/helixClient.ts`, internal to that file) —
  no user interaction, used for public Helix lookups: current game, broadcaster ID, live status,
  profile pictures. Cached in memory, refreshed on expiry.
- **User (bot) access token** (Authorization Code flow, `server/src/twitch/oauth.ts`) — obtained once via
  the WebUI's "Connect with Twitch" popup (button lives on the Dashboard, not Settings —
  `server/src/routes/twitchOAuth.ts`, mirrors the redirect-URI auto-detection pattern documented in the
  project's setup notes), persisted in the `settings` table, auto-refreshed. Used for tmi.js chat login and
  for `moderator:read:followers` (the bot account must be a channel moderator for the Follower permission
  tier to work).

### Twitch OAuth requires real HTTPS — `TLS_PORT` bundles a self-signed listener for it
Twitch rejects `http://` redirect URIs outright at app-registration time for anything but literal
`localhost` (confirmed live in the Twitch Developer Console: "Redirect URIs must use HTTPS protocol").
Self-hosted deployments with no TLS-terminating reverse proxy — the common case: reached directly by LAN
IP, e.g. most Unraid installs — have no other way to satisfy that. Setting the optional `TLS_PORT` env var
(`server/src/index.ts`) starts a second `https.createServer` on the *same* Express `app` used for the main
`PORT` listener, using a self-signed cert `server/src/tls/selfSignedCert.ts` generates once (SAN includes
`PUBLIC_URL`'s hostname if set, plus `localhost`/`127.0.0.1`) and persists to `DATA_DIR` so restarts don't
force a fresh browser click-through. `PUBLIC_URL` must then point at that `https://host:TLS_PORT` address —
`getRedirectUri()` in `twitchOAuth.ts` uses `PUBLIC_URL` verbatim over the incoming request's own
protocol/host specifically so the OAuth redirect URI can point at the TLS port while the WebUI itself keeps
being served over plain HTTP on the main `PORT` day-to-day. The browser shows one untrusted-certificate
warning to click through per cert (not per session) since it's self-signed, not CA-issued.

### The bot has no manual start/stop
`server/src/twitch/chatClient.ts` auto-connects whenever authorized + a channel is configured — triggered
from server boot (`index.ts`), right after OAuth completes, and right after Twitch settings are saved
(`routes/settings.ts`). `connectBot()` is a no-op if already connected, or if a connect attempt is
already in flight — this guard exists because Twitch IRC kicks duplicate logins, and without it,
multiple auto-connect triggers firing close together caused a connect/disconnect loop. Each tmi.js
client instance's event handlers check `client === thisClient` before touching shared state, so a
stale/superseded client's belated "disconnected" event can't clobber a newer working connection.
There is no user-facing connect/disconnect control; the Dashboard only displays status.

**The duplicate-login guard keys off `connectInFlight`, never off `status === "connecting"`** — those
are two different things: `connectInFlight` means an attempt is genuinely running right now, while
`status === "connecting"` also covers "a drop happened and a retry is queued". Conflating them
silently killed auto-reconnect: both retry paths (the tmi.js `disconnected` handler and the
connect-timeout catch) set the status to `"connecting"` before scheduling, so when the retry fired,
`connectBot()` saw its own placeholder status and returned having done nothing. After its first
unexpected drop the bot never came back — it sat at `"connecting"` forever and needed a container
restart to clear (confirmed live on the production Unraid instance, whose `/api/bot/status` read
`{"status":"connecting","channel":"sweevee","botLogin":"sweevbot","error":""}` — the empty `error`
is tmi.js's disconnect reason for a plain socket drop, which the `disconnected` handler now
normalizes to a readable message). This is also why the 20s connect-timeout below didn't help on its
own — it correctly turned a hung handshake into a retry, and that retry hit the same dead guard.
`connectInFlight` is set **synchronously before the first `await`** in `connectBot()`, so two
near-simultaneous triggers can't both get past it, and cleared in a `finally`. Both retry paths go
through `scheduleReconnect()`, which keeps at most one pending `reconnectTimer` and backs off
exponentially from `RECONNECT_DELAY_MS` (5s) to `RECONNECT_MAX_DELAY_MS` (60s), resetting
`reconnectAttempts` on a successful `connected` event — the backoff exists because every attempt
calls `getValidBotAccessToken()`, which may hit Twitch's token endpoint. `disconnectBot()` clears the
pending timer and resets the counter, so a deliberate disconnect doesn't get undone by a stale retry.

**`connectBot()`'s IRC handshake is wrapped in a 20s timeout** (`CONNECT_TIMEOUT_MS`, `withTimeout()` in
`chatClient.ts`) because tmi.js's `connect()` promise can hang indefinitely on a stalled handshake — it
neither resolves nor rejects, so without a timeout the status sits at `"connecting"` forever with no retry
and no error, indistinguishable from a slow-but-working connection (this happened live: the container had
to be restarted to clear it). A timeout is treated as a transient drop — the stale client is torn down and
a reconnect is scheduled after `RECONNECT_DELAY_MS`, same as an unexpected mid-session disconnect — whereas
any other `connect()` rejection (bad token, unconfigured channel) still goes to `"error"` and gives up
(`desiredConnected = false`), since retrying a permanent config problem forever isn't useful.

### Command pipeline
`chatClient.ts` (tmi.js `message` event) → `commandRouter.ts` (parses `!word`, resolves aliases via
`settingsService.resolveCommandByWord`, checks `permissions.ts` then `cooldowns.ts`) → one of
`twitch/commands/*.ts` → `services/quotesService.ts` (same service the REST routes use — single source of
truth) → `services/templateService.ts` renders the configured response template → reply in chat →
`events/bus.ts` publishes an event for the live activity log.

Permissions rank `everyone < follower < subscriber < vip < moderator < broadcaster`
(`shared/src/types.ts` `ROLE_RANK`). Subscriber/VIP/moderator/broadcaster are read synchronously from
tmi.js badges; Follower is the only tier requiring a live (5-min cached) Helix call, so it's only checked
when a command actually requires it.

### Data layer: libsql, not better-sqlite3
Uses `@libsql/client` (async, Node-API prebuilt binaries) instead of `better-sqlite3` specifically because
better-sqlite3 has no prebuilt binary for newer Node versions on Windows and requires a full VS Build Tools
install to compile from source. This makes every DB call async — there is no sync query path anywhere.

**Known driver gotcha**: `.get()` on an `UPDATE ... RETURNING` that matches zero rows throws instead of
resolving to `undefined` (unlike a plain `SELECT ... .get()` with zero rows, which resolves fine). Always
use `.returning().all()` and take `rows[0]` for updates/deletes where the row might not exist
(`quotesService.updateQuote` is the reference implementation) — this exact bug once caused `!editquote` on
a bad ID to silently do nothing instead of replying "Quote not found."

Settings are a key-value table (`services/settingsService.ts` `getSetting`/`setSetting`) rather than typed
columns — everything from Twitch tokens to the WebUI password hash lives there. Per-command config
(permission, cooldowns, aliases, response template) is its own table, seeded with defaults in
`ensureBootstrap()` on first boot.

### WebUI session cookie's `secure` flag is auto-detected, never hardcoded
`server/src/auth/session.ts` deliberately omits `cookie-session`'s `secure` option. The underlying `cookies`
package then auto-detects it per-request from `req.protocol` (which respects `X-Forwarded-Proto`, since
`app.ts` sets `trust proxy`) — so it's `secure` when reached over real or self-signed HTTPS and not-secure
over plain HTTP, correct in all three deployment shapes (direct HTTP, the bundled `TLS_PORT` listener, and a
reverse proxy). A previous version hardcoded `secure: NODE_ENV === "production"`, which broke every
plain-HTTP deployment (the common self-hosted case, e.g. Unraid reached directly by LAN IP): `cookies.set()`
throws `"Cannot send secure cookie over unencrypted connection"` when `secure:true` is forced but the
connection isn't HTTPS, and `cookie-session` silently swallows that throw in its `onHeaders` callback — so
the `Set-Cookie` header was just never sent, and every request looked unauthenticated with no visible error
anywhere (not in the response, not in a thrown exception — only as repeated 401s).

### Backups
`services/backupService.ts` snapshots the full `quotes` table as a JSON blob into `quote_backups`, capped
at 7 (oldest pruned on every insert). Triggers: manual (WebUI button), `stream_start` (auto, via
`twitch/streamMonitor.ts` polling Helix "Get Streams" every 2 minutes — chosen over EventSub to avoid
needing a public webhook endpoint or WebSocket subscription management), `pre_restore` (an automatic safety
snapshot, labeled "Automated Backup" in the WebUI, taken immediately before any restore so a restore is
itself undoable), and `import` (an uploaded backup JSON file, stored as a new backup entry). Restore fully
replaces the live `quotes` table, preserving original IDs.

**AUTOINCREMENT gotcha**: `quotes.id` is `INTEGER PRIMARY KEY AUTOINCREMENT`, which tracks the highest
ID ever issued in SQLite's internal `sqlite_sequence` table — deleting rows never lowers it. Because
`restoreBackup()` deletes all quotes and reinserts them with their original preserved IDs, restoring to a
backup with a lower max ID than the live table's counter would leave the counter stale, so the next
`!addquote` would silently skip ahead (e.g. jump from 167 to 174) instead of continuing at 168. To prevent
this, `restoreBackup()` resyncs `sqlite_sequence` to `MAX(id)` of the restored data immediately after
reinserting. Any future code path that bulk-deletes and reinserts `quotes` with explicit IDs must do the
same.

Picking a file via the WebUI's Import button (`pages/BackupsPage.tsx`) does *not* touch the server — it's
only read and parsed client-side into a `RestoreTarget` of kind `"import"` (as opposed to `"existing"` for
a row already in the backups list), which opens the same restore confirmation dialog used for existing
backups. Nothing is sent to the backend until the user clicks "Restore Backup": only then does
`handleConfirmRestore` call `POST /api/backups/import` (creates the `pre_restore` safety snapshot, then the
`import` entry) followed immediately by `POST /api/backups/:id/restore` with `skipSafetyBackup: true` (the
import call already snapshotted current quotes seconds earlier, so restore doesn't take a second, near-
identical one). This two-request sequence is also why `pre_restore` always sorts ahead of the `import` entry
it belongs to in the list — clicking Cancel on a freshly-picked file makes zero backend calls and leaves no
trace. Restoring an *existing* backup row instead calls `POST /api/backups/:id/restore` with no skip flag,
so it still gets its own safety snapshot.

### Live activity log survives navigation
`web/src/context/BotEventsContext.tsx` owns the single SSE connection (`/api/events`) at the app root, not
per-page — otherwise switching tabs would drop and reset it. It's also self-healing: the server sends a
named `heartbeat` SSE event every 15s (not a bare comment, which `EventSource.onmessage` can't see), and the
client force-reconnects if 40s pass with nothing received. This exists because a server restart can leave
the browser's `EventSource` silently "open" on a dead socket that never fires a close/error event, which
native browser retry logic can't detect on its own.

### Frontend structure
React Router pages (`web/src/pages/*.tsx`) under `App.tsx`'s nav shell. Two context providers wrap the
authenticated app: `AuthContext` (session state) and `BotEventsContext` (see above). `api/client.ts` is a
single typed wrapper around every backend endpoint. Shared request/response shapes come from
`@quotation/shared` so frontend and backend can't drift silently — always add new types/zod schemas there
first when adding an endpoint.

The design system lives in `web/src/styles.css` as CSS custom properties (`--accent`, `--panel`, etc.) plus
reusable classes (`.panel`/`.panel-header`/`.panel-body`, `.data-table`, `.btn`/`.icon-btn`, `.pill`,
`.trigger-badge`). New pages should compose these rather than introducing one-off styles.

### Public quotes page and SweevElements link
Added 2026-11-18. **API key:** `services/integrationService.ts` (`integration_api_key_hash` = SHA-256 of a
`qtn_`+64-hex key, shown once; constant-time verify), `middleware/requireApiKey.ts` (Bearer or `X-Api-Key`),
`middleware/rateLimit.ts`. Machine API `routes/integration.ts` at `/api/integration/v1` (`/ping`, `/quotes`,
`/quotes/:id`), read-only, restricted DTO `PublicQuote {id,text,author,game,createdAt}` — never
`addedBy`/`edited*`.

**Standalone page:** `routes/publicQuotes.ts` + `services/publicQuotesPage.ts` serve `/public/quotes` and
`/public/quotes/:id` (`/quotes` is the admin SPA route), server-rendered in Quotation's own look (inlined
tokens, `color-scheme: dark`), strict CSP with no scripts, off by default (setting `public_page_enabled`),
identical 404 when off. Optional env `PUBLIC_PORT` starts a second Express app (`createPublicApp()` in
`app.ts`) that serves ONLY that page, so one port can be exposed without the admin login. The SPA fallback
regex excludes `/public`.

**Settings UI:** `web/src/components/IntegrationPanel.tsx`; endpoints `GET/PUT /api/settings/integration`,
`POST/DELETE /api/settings/integration/key`. **Check:** `node --import tsx scripts/integration-check.ts`
from `server/` (spawns the server on a scratch DATA_DIR). `web` `tsc` has 4 pre-existing `App.tsx`
`isActive` implicit-any errors unrelated to this.
