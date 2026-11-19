# Security best-practices report: Quotation

Generated 2026-11-19 with OpenAI's `security-best-practices` skill, run through Claude Code. No code was changed.

**Stack:** TypeScript on Node 22. Backend is Express 4.22 with `cookie-session`, zod, drizzle/libsql and tmi.js. Frontend is React with Vite. Evidence: `server/package.json`, `web/package.json`, `server/src/app.ts`. References applied: `javascript-express-web-server-security.md`, `javascript-typescript-react-web-frontend-security.md`, `javascript-general-web-frontend-security.md`. Go and Python references do not apply.

## Executive summary
The code is in good shape. I found no injection, XSS, SSRF, path-traversal or command-execution sinks. The previous sweep (`docs/security/2026-11-19-sweep.md`) fixed most of the serious items, and `npm audit --omit=dev` reports 0 vulnerabilities today. The remaining gaps matter mainly because the owner says the admin port may be reachable from the internet. The one high finding is that the login rate limit can be bypassed by spoofing `X-Forwarded-For` when no real proxy is in front. The rest are defence-in-depth items.

Counts: **1 high, 4 medium, 3 low, 2 informational**. Nothing critical.

## High

### F-1: Login rate limit is bypassable behind the default `TRUST_PROXY=1` (EXPRESS-PROXY-001, EXPRESS-AUTH-001)
- **Location:** `server/src/config/env.ts:38`, `server/src/app.ts:56`, `server/src/middleware/rateLimit.ts:12`, `server/src/routes/auth.ts:12`
- **Evidence:** `TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1)`; `app.set("trust proxy", env.TRUST_PROXY)`; key is `` `${bucket}:${req.ip ?? "unknown"}` ``.
- **Impact:** If the container is reached directly (the documented Unraid install), Express trusts one hop of `X-Forwarded-For` that nothing overwrites. An attacker sets a new value on every request, so the 10-per-15-minutes limit never trips and the admin password can be guessed without limit. A successful guess gives full admin control.
- **Fix:** Default `TRUST_PROXY` to `0`, or leave it unset and require it explicitly when a proxy is used. Add `TRUST_PROXY` to `.env.example` and `docker-compose.yml` with a comment. A repo-wide search found it mentioned only in `docs/`, not in the README, compose file or `.env.example`.
- **Mitigation:** Add a global failed-login counter or increasing delay that does not depend on IP. Do not forward port 8766 to the internet; use a VPN or an authenticating HTTPS proxy.
- **False-positive notes:** Not exploitable if a proxy that overwrites `X-Forwarded-For` sits in front with exactly one hop. The proxy setup is unknown.

## Medium

### F-2: No security headers on the admin app (EXPRESS-HEADERS-001, REACT-HEADERS-001, JS-CSP-001)
- **Location:** `server/src/app.ts:52-79`; `web/index.html`
- **Evidence:** `createApp()` has no `helmet`, CSP, `frame-ancestors`, `X-Content-Type-Options` or referrer policy. Only the public router and the OAuth popup set their own headers.
- **Impact:** If an XSS bug is ever introduced in the SPA, nothing limits it. Framing and sniffing protections are also absent. No current sink was found (`dangerouslySetInnerHTML`, `innerHTML`, `eval` and similar all have zero hits in `web/src`), so this is defence in depth.
- **Fix:** Add `helmet()` early in `createApp` with a CSP whose `script-src` is `'self'`. The SPA loads a Google Fonts stylesheet (`web/index.html`), so allow `fonts.googleapis.com` and `fonts.gstatic.com` or self-host the font. Start in report-only mode.
- **Mitigation:** Set these headers at a reverse proxy instead.

### F-3: CSRF protection relies only on `SameSite=Lax` (EXPRESS-CSRF-001, REACT-CSRF-001)
- **Location:** `server/src/auth/session.ts:14-20`, `server/src/app.ts:59-71`
- **Evidence:** Cookie auth with `sameSite: "lax"`, and no token, Origin check or custom header on non-GET routes. Body-bearing requests are partly protected because `express.json()` only parses `application/json`.
- **Impact:** `SameSite` is scoped to the site, not the port. A compromised or hostile page on the same host or IP (for example another container on the same Unraid box) can send credentialed simple requests with no body to `POST /api/backups`, `POST /api/settings/integration/key` or `POST /api/backups/:id/restore`. Realistic only with such a foothold.
- **Fix:** Require a custom header on non-GET `/api` requests (the SPA's `api/client.ts` `fetch` wrapper at line 37 is the one place to add it), or reject requests whose `Origin` is not the app's own origin.
- **False-positive notes:** Modern browsers do not send Lax cookies on cross-site POSTs, so ordinary internet CSRF is already blocked.

### F-4: Weak seed password is accepted (EXPRESS-AUTH-001)
- **Location:** `server/src/config/env.ts:12`, `:49`
- **Evidence:** `WEBUI_PASSWORD: z.string().min(1)`; the production guard rejects only the literal `"change-me"`. The change-password form requires 8 characters (`shared/src/schemas.ts:13`), but the env seed does not.
- **Impact:** With F-1 present, a short password falls quickly.
- **Fix:** Enforce a minimum length (12 or more) in the production guard.

### F-5: Twitch client secret and bot tokens stored in plaintext (EXPRESS-SESS-002 spirit, REACT-CONFIG-001)
- **Location:** `server/src/twitch/oauth.ts:66-71`, `server/src/routes/settings.ts:64`, `server/src/services/settingsService.ts:105-111`
- **Evidence:** `setSetting("twitch_bot_access_token", …)`, `setSetting("twitch_bot_refresh_token", …)`, `setSetting("twitch_client_secret", …)`.
- **Impact:** Anyone who can read `data/` or a copy of the SQLite file can act as the bot and the Twitch app. The API never returns the secret (`routes/settings.ts:42-48`), so exposure needs host or backup access. The previous sweep accepted this.
- **Fix:** Encrypt these values with a key from a separate env var, or document that host permissions are the control.

## Low

### F-6: Logout and session lifetime are client-side only (EXPRESS-SESS-002)
- **Location:** `server/src/routes/auth.ts:35-38`, `server/src/middleware/requireAuth.ts:6-10`
- **Impact:** A stolen cookie works for up to 7 days after logout unless the password changes.
- **Fix:** Shorten `maxAge`, or add a server-side session epoch stored in `settings` that logout bumps and the cookie must match.

### F-7: Fingerprinting headers on the main app (EXPRESS-FINGERPRINT-001)
- **Location:** `server/src/app.ts:52` (compare `app.ts:35`, where the public app does disable it)
- **Fix:** Add `app.disable("x-powered-by")` to `createApp`. Helmet (F-2) does this too.

### F-8: Third-party stylesheet loaded without integrity (REACT-SRI-001)
- **Location:** `web/index.html:7-10`
- **Evidence:** Google Fonts `<link rel="stylesheet">` with no `integrity`. SRI is impractical for Google's dynamic CSS.
- **Fix:** Self-host Inter (also removes a third-party request and simplifies the CSP in F-2).

## Informational
- **I-1 Session cookie `Secure` flag:** Deliberately auto-detected per request (`auth/session.ts:7-13`), which is the correct pattern for the plain-HTTP LAN case. No change recommended. If the admin is exposed to the internet, put HTTPS in front of it; do not rely on the bundled self-signed listener for day-to-day use.
- **I-2 Default body limit:** `express.json()` at `app.ts:59` uses the 100 kb default. That is a safe limit, but a legitimate import of thousands of long quotes can exceed it and fail with 413. Raise it for the two import routes only, if that matters.

## Checked and clean
- SQL: all queries go through drizzle; the one raw fragment escapes LIKE wildcards (`services/quotesService.ts:73-81`) and the `sqlite_sequence` update uses a bound value (`services/backupService.ts:142`).
- XSS: public page and OAuth popup escape all dynamic values and use nonce CSPs (`services/publicQuotesPage.ts`, `routes/twitchOAuth.ts:24-41`). React renders quote text through JSX. No DOM sinks in `web/src`.
- Redirects: the only redirects are to fixed internal paths (`routes/twitchOAuth.ts:59`, `routes/publicQuotes.ts:55` with a validated integer).
- SSRF: all outbound fetches use fixed Twitch hosts; user values are `encodeURIComponent`-encoded (`twitch/helixClient.ts`).
- postMessage: sender uses `window.location.origin`; the receiver checks `e.origin` (`pages/DashboardPage.tsx:80`).
- Files and processes: no `child_process`, no `sendFile` with user paths, no uploads; `express.static` serves only the built SPA.
- API key: 256-bit random, only the SHA-256 hash stored, constant-time compare (`services/integrationService.ts`).
- Container: non-root drop via gosu, `npm ci --ignore-scripts`, ports bound to localhost in compose, no `--inspect` anywhere.
- Dependencies: `npm audit --omit=dev` reports 0 vulnerabilities (run 2026-11-19).

## Not done
- No scanners other than `npm audit` were run (no Semgrep, OSV-Scanner or Trivy installed here). `security.yml` already runs `npm audit` and OSV on CI.
- `.github/workflows/docker.yml` and the web pages other than the sink greps were not read line by line.
- No dynamic testing against a running server.

## Fixes applied (2026-11-19, after the report was read)
| Finding | Change |
|---|---|
| F-1 | `TRUST_PROXY` now defaults to 0; documented in `.env.example` and `docker-compose.yml`. |
| F-2, F-7 | `middleware/securityHeaders.ts`: CSP (`script-src 'self'`), nosniff, no-referrer, frame denial; `x-powered-by` disabled. Done by hand, no helmet dependency. |
| F-3 | Non-GET `/api` requests need `X-Requested-With: quotation`; the SPA `request()` wrapper sends it. Verified: login without it returns 403. |
| F-4 | First-run seed of `WEBUI_PASSWORD` must be 12+ chars in production. Existing installs are unaffected (only checked when no hash exists). |
| F-5 | Twitch client secret and bot tokens are AES-256-GCM encrypted at rest (`auth/secretBox.ts`), key derived from `SESSION_SECRET`. Legacy plaintext rows migrate on first read. Verified in the DB. **Rotating `SESSION_SECRET` now makes them undecryptable; re-enter the secret and re-authorise the bot.** |
| F-6 | Logout and password change bump a server-side `session_epoch`, so copied cookies stop working. Verified. Every existing session is invalidated once on upgrade. |
| F-8 | Inter is self-hosted via `@fontsource/inter`; Google Fonts links removed. |
| I-2 | Not changed (informational). |
