/**
 * Integration check: spawns the real server on a scratch DATA_DIR (zero-config first-run flow, no env
 * secrets) and verifies the API-key integration API, its restricted DTO, and the standalone public quotes
 * page: escaping, search wildcards, parameter handling, headers, no cookies, anonymous lockout and the
 * 90/min rate limit.
 * Run from `server/`: node --import tsx scripts/integration-check.ts
 * Needs `npm run build -w shared` to have been run after pulling (the server imports @quotation/shared).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 18766;
const base = `http://127.0.0.1:${PORT}`;
const P = `${base}/public/quotes`;
const dataDir = mkdtempSync(path.join(tmpdir(), "quotation-check-"));
const PASSWORD = "check-password-123456";
let failures = 0;
let log = "";
let publicHits = 0;
let firstPublicHit = 0;

function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
}

const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: path.join(import.meta.dirname, ".."),
  env: { ...process.env, NODE_ENV: "test", PORT: String(PORT), DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout?.on("data", (d: Buffer) => (log += d));
child.stderr?.on("data", (d: Buffer) => (log += d));

async function waitUp(): Promise<void> {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${log.slice(-800)}`);
    try {
      if ((await fetch(`${base}/api/auth/me`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not start within 30 s:\n${log.slice(-800)}`);
}

/** Every request to the public page goes through here so the rate-limit check can count them. */
async function pf(url: string, init?: RequestInit): Promise<Response> {
  if (url.startsWith(P)) {
    if (!firstPublicHit) firstPublicHit = Date.now();
    publicHits++;
  }
  return fetch(url, init);
}
const status = async (url: string, init?: RequestInit) => (await pf(url, init)).status;
const stripNonce = (s: string) => s.replace(/nonce="[^"]*"/g, "").replace(/'nonce-[^']*'/g, "");
const rows = (html: string) => (html.match(/<li id="q/g) ?? []).length;

try {
  await waitUp();

  // First run: the first visitor creates the password (zero-config).
  const H = { "content-type": "application/json", "x-requested-with": "quotation" };
  const me = (await (await fetch(`${base}/api/auth/me`)).json()) as { needsSetup: boolean };
  check("fresh install asks for first-run setup", me.needsSetup === true);
  const setup = await fetch(`${base}/api/auth/setup`, { method: "POST", headers: H, body: JSON.stringify({ password: PASSWORD, confirm: PASSWORD }) });
  const cookie = setup.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  check("first-run setup creates the owner and a session", setup.ok && cookie.length > 0, String(setup.status));
  check("setup refuses once a password exists", (await fetch(`${base}/api/auth/setup`, { method: "POST", headers: H, body: JSON.stringify({ password: PASSWORD, confirm: PASSWORD }) })).status === 409);
  const admin = (p: string, init: RequestInit = {}) => fetch(`${base}${p}`, { ...init, headers: { ...H, cookie, ...(init.headers ?? {}) } });

  const mk = async (text: string, author: string, game: string | null = null) => {
    const r = await admin("/api/quotes", { method: "POST", body: JSON.stringify({ text, author, game }) });
    return (await r.json()) as { id: number };
  };
  const hostile = await mk("Hello <script>alert(1)</script> & \"q\" 's", "A<b>uth</b>", "G<i>ame</i>");
  const pct = await mk("fifty 100% sure", "PctGuy");
  const und = await mk("snake_case thing", "UndGuy");
  const back = await mk("back\\slash here", "BackGuy");
  const plain = await mk("plain quote number four", "Plain");
  for (let i = 0; i < 30; i++) await mk(`filler ${i}`, "Filler");
  check("quotes created", [hostile, pct, und, back, plain].every((q) => typeof q.id === "number"));

  // Integration API
  check("integration 401 with no key", (await fetch(`${base}/api/integration/v1/ping`)).status === 401);
  const keyRes = await admin("/api/settings/integration/key", { method: "POST" });
  const { apiKey } = (await keyRes.json()) as { apiKey: string };
  check("key generated once", keyRes.ok && apiKey.startsWith("qtn_"));
  const settings = (await (await admin("/api/settings/integration")).json()) as Record<string, unknown>;
  check("settings never return the key", !JSON.stringify(settings).includes(apiKey) && settings.hasApiKey === true);
  const auth = { authorization: `Bearer ${apiKey}` };
  check("wrong key -> 401", (await fetch(`${base}/api/integration/v1/ping`, { headers: { authorization: "Bearer nope" } })).status === 401);
  check("empty bearer -> 401", (await fetch(`${base}/api/integration/v1/ping`, { headers: { authorization: "Bearer " } })).status === 401);
  const ping = await fetch(`${base}/api/integration/v1/ping`, { headers: auth });
  const pingBody = (await ping.json()) as { app: string; count: number };
  check("ping ok with Bearer", ping.ok && pingBody.app === "quotation" && pingBody.count === 35);
  check("X-Api-Key accepted", (await fetch(`${base}/api/integration/v1/ping`, { headers: { "x-api-key": apiKey } })).ok);
  const list = await fetch(`${base}/api/integration/v1/quotes?pageSize=100`, { headers: auth });
  const listBody = (await list.json()) as { items: Record<string, unknown>[]; total: number };
  check("list returns every quote", list.ok && listBody.total === 35);
  check("DTO is restricted (no addedBy/edited*)", listBody.items.every((q) => Object.keys(q).sort().join(",") === "author,createdAt,game,id,text"), Object.keys(listBody.items[0] ?? {}).join(","));
  check("single quote 404", (await fetch(`${base}/api/integration/v1/quotes/9999`, { headers: auth })).status === 404);
  check("pageSize above 100 -> 400", (await fetch(`${base}/api/integration/v1/quotes?pageSize=101`, { headers: auth })).status === 400);
  check("page above 100000 -> 400 (SweevElements clamps to this cap)", (await fetch(`${base}/api/integration/v1/quotes?page=100001`, { headers: auth })).status === 400);

  // Anonymous lockout
  check("anonymous /api/quotes -> 401", (await fetch(`${base}/api/quotes`)).status === 401);
  check("anonymous /api/settings/integration -> 401", (await fetch(`${base}/api/settings/integration`)).status === 401);
  check("admin write without the X-Requested-With header -> 403", (await fetch(`${base}/api/quotes`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ text: "x", author: "y" }) })).status === 403);

  // Public page: off by default, identical 404.
  const off = await pf(P);
  const offBody = stripNonce(await off.text());
  check("public page 404 while disabled", off.status === 404);
  check("disabled list and unknown id share one 404 body", offBody === stripNonce(await (await pf(`${P}/abc`)).text()));

  await admin("/api/settings/integration", { method: "PUT", body: JSON.stringify({ publicPageEnabled: true }) });
  const on = await pf(P);
  const html = await on.text();
  const hd = (n: string) => on.headers.get(n) ?? "";
  check("public page renders when enabled", on.ok && html.includes("Quotes") && rows(html) === 25);
  check("strict CSP: default-src none, no script, same-origin forms, nonce styles", /default-src 'none'/.test(hd("content-security-policy")) && !/script-src/.test(hd("content-security-policy")) && /form-action 'self'/.test(hd("content-security-policy")) && /frame-ancestors 'none'/.test(hd("content-security-policy")) && /style-src 'nonce-/.test(hd("content-security-policy")));
  check("no-store, nosniff, no-referrer, Permissions-Policy, COOP", hd("cache-control") === "no-store" && hd("x-content-type-options") === "nosniff" && hd("referrer-policy") === "no-referrer" && hd("permissions-policy").includes("camera=()") && hd("cross-origin-opener-policy") === "same-origin", `${hd("cache-control")} | ${hd("permissions-policy")} | ${hd("cross-origin-opener-policy")}`);
  check("no Set-Cookie, no CORS header for a foreign Origin", on.headers.getSetCookie().length === 0 && !(await pf(P, { headers: { origin: "https://evil.example" } })).headers.get("access-control-allow-origin"));
  check("no scripts, inline handlers or external refs", !/<script/i.test(html) && !/ on[a-z]+=/i.test(html) && !/(src|href)="https?:\/\//i.test(html));
  check("public page leaks no admin fields", !/addedBy|added_by|edited|apiKey|webui|qtn_[0-9a-f]{8}/i.test(html));

  // Escaping of stored data (the hostile quote is #1, so it is found by search / its own page, not on page 1)
  for (const [label, t] of [["search list", await (await pf(`${P}?q=Hello`)).text()], ["single quote page", await (await pf(`${P}/${hostile.id}`)).text()]] as const) {
    check(`text, author and game are HTML-escaped on the ${label}`, t.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !t.includes("<script>alert(1)") && !t.includes("<b>uth") && !t.includes("<i>ame") && t.includes("A&lt;b&gt;uth&lt;/b&gt;") && t.includes("G&lt;i&gt;ame&lt;/i&gt;") && t.includes("&amp; &quot;q&quot; &#39;s"));
  }
  const marker = encodeURIComponent('"><zzmark onerror=zz>');
  const reflected = await (await pf(`${P}?q=${marker}`)).text();
  check("search term is reflected escaped, no raw tag, no attribute break", !reflected.includes("<zzmark") && reflected.includes("&lt;zzmark") && !/value="[^"]*"[^>]*onerror=zz/.test(reflected));
  check("pager hrefs keep the search term encoded", /href="\?q=filler&amp;page=2"/.test(await (await pf(`${P}?q=filler`)).text()));

  // LIKE wildcards are literal
  const hits = async (q: string) => rows(await (await pf(`${P}?q=${encodeURIComponent(q)}`)).text());
  check("search '%' matches only a literal %", (await hits("%")) === 1);
  check("search '_' matches only a literal _", (await hits("_")) === 1);
  check("search '\\' matches only a literal backslash", (await hits("\\")) === 1);
  check("SQL-looking search is harmless", (await hits("' OR 1=1 --")) === 0);
  check("normal search works", (await hits("snake")) === 1);

  // Parameters, paths, methods
  check("page=0, page=1001, page=abc -> 404", (await status(`${P}?page=0`)) === 404 && (await status(`${P}?page=1001`)) === 404 && (await status(`${P}?page=abc`)) === 404);
  check("page=1000 (the cap) -> 200 empty state", (await status(`${P}?page=1000`)) === 200);
  check("q as an array or over 100 chars -> 404", (await status(`${P}?q=a&q=b`)) === 404 && (await status(`${P}?q=${"A".repeat(101)}`)) === 404);
  const jump = await pf(`${P}?n=${plain.id}`, { redirect: "manual" });
  check("jump-to-number redirects to the same-origin path", jump.status === 302 && jump.headers.get("location") === `/public/quotes/${plain.id}`);
  const evil = await pf(`${P}?n=${encodeURIComponent("//evil.example")}`, { redirect: "manual" });
  check("n=//evil.example does not redirect off-site", evil.status === 404 && !evil.headers.get("location"));
  for (const id of ["abc", "-1", "0", "1e3", "0x1", "99999999999999999999", "1%27%20OR%201=1--", "%2e%2e%2fapi", "1%0d%0aX-Injected:1"]) {
    const s = await status(`${P}/${id}`);
    check(`/public/quotes/${id} -> 404/400`, s === 404 || s === 400, String(s));
  }
  check("single quote page renders", (await status(`${P}/${plain.id}`)) === 200);
  check("unknown id 404 body matches the disabled one", stripNonce(await (await pf(`${P}/999999`)).text()) === offBody);
  check("POST/PUT/DELETE are not served", (await status(P, { method: "POST" })) === 404 && (await status(P, { method: "PUT" })) === 404 && (await status(P, { method: "DELETE" })) === 404);

  // Rate limit: 90 requests per minute, counted across everything sent to /public/quotes so far in this run.
  let firstLimited = 0;
  for (let i = 0; i < 100 && !firstLimited; i++) if ((await status(`${P}?page=1`)) === 429) firstLimited = publicHits;
  const limited = await pf(P);
  check("request #91 inside the minute is the first 429", firstLimited === 91 && Date.now() - firstPublicHit < 55_000, `first 429 at request ${firstLimited}`);
  check("429 carries Retry-After and no-store", limited.status === 429 && !!limited.headers.get("retry-after") && limited.headers.get("cache-control") === "no-store");

  // Revoking the key locks the integration API out again.
  await admin("/api/settings/integration/key", { method: "DELETE" });
  check("revoked key -> 401", (await fetch(`${base}/api/integration/v1/ping`, { headers: auth })).status === 401);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
