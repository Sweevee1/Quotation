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

## Architecture

### Twitch auth is two independent token flows
- **App access token** (Client Credentials, `server/src/twitch/helixClient.ts`, internal to that file) —
  no user interaction, used for public Helix lookups: current game, broadcaster ID, live status,
  profile pictures. Cached in memory, refreshed on expiry.
- **User (bot) access token** (Authorization Code flow, `server/src/twitch/oauth.ts`) — obtained once via
  the WebUI's "Connect with Twitch" popup (`server/src/routes/twitchOAuth.ts`, mirrors the redirect-URI
  auto-detection pattern documented in the project's setup notes), persisted in the `settings` table,
  auto-refreshed. Used for tmi.js chat login and for `moderator:read:followers` (the bot account must be a
  channel moderator for the Follower permission tier to work).

### The bot has no manual start/stop
`server/src/twitch/chatClient.ts` auto-connects whenever authorized + a channel is configured — triggered
from server boot (`index.ts`), right after OAuth completes, and right after Twitch settings are saved
(`routes/settings.ts`). `connectBot()` is a no-op if already connected/connecting — this guard exists
because Twitch IRC kicks duplicate logins, and without it, multiple auto-connect triggers firing close
together caused a connect/disconnect loop. Each tmi.js client instance's event handlers check
`client === thisClient` before touching shared state, so a stale/superseded client's belated "disconnected"
event can't clobber a newer working connection. There is no user-facing connect/disconnect control; the
Dashboard only displays status.

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
