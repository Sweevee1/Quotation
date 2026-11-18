/**
 * Integration check: spawns the real server on a scratch DATA_DIR and verifies the API-key
 * integration API, the restricted DTO, and the standalone public quotes page (incl. PUBLIC_PORT).
 * Run from `server/`: node --import tsx scripts/integration-check.ts
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 18766;
const PUBLIC_PORT = 18767;
const base = `http://127.0.0.1:${PORT}`;
const pub = `http://127.0.0.1:${PUBLIC_PORT}`;
const dataDir = mkdtempSync(path.join(tmpdir(), "quotation-check-"));
let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
}

const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: path.join(import.meta.dirname, ".."),
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(PORT),
    PUBLIC_PORT: String(PUBLIC_PORT),
    DATA_DIR: dataDir,
    WEBUI_PASSWORD: "check-password-123",
    SESSION_SECRET: "check-secret",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitUp(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/api/auth/me`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start");
}

try {
  await waitUp();

  // Admin session.
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "check-password-123" }),
  });
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const admin = (p: string, init: RequestInit = {}) =>
    fetch(`${base}${p}`, {
      ...init,
      headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) },
    });

  const created = await admin("/api/quotes", {
    method: "POST",
    body: JSON.stringify({ text: "Hello <script>alert(1)</script> world", author: "Tester", game: "Zelda" }),
  });
  const quote = (await created.json()) as { id: number };
  check("admin can create a quote", created.ok && typeof quote.id === "number", String(created.status));

  // Before any key exists, the integration API refuses everything.
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
  check("ping ok with Bearer", ping.ok && pingBody.app === "quotation" && pingBody.count === 1);
  check("X-Api-Key accepted", (await fetch(`${base}/api/integration/v1/ping`, { headers: { "x-api-key": apiKey } })).ok);

  const list = await fetch(`${base}/api/integration/v1/quotes?pageSize=5`, { headers: auth });
  const listBody = (await list.json()) as { items: Record<string, unknown>[]; total: number };
  check("list returns the quote", list.ok && listBody.total === 1 && listBody.items[0]?.id === quote.id);
  const keys = Object.keys(listBody.items[0] ?? {}).sort().join(",");
  check("DTO is restricted (no addedBy/edited*)", keys === "author,createdAt,game,id,text", keys);
  check("single quote 404", (await fetch(`${base}/api/integration/v1/quotes/9999`, { headers: auth })).status === 404);
  check("bad pageSize -> 400", (await fetch(`${base}/api/integration/v1/quotes?pageSize=1000`, { headers: auth })).status === 400);

  // Public page: off by default, identical 404.
  const off = await fetch(`${base}/public/quotes`);
  const stripNonce = (s: string) => s.replace(/nonce="[^"]*"/g, "");
  const offBody = stripNonce(await off.text());
  const unknown = await fetch(`${base}/public/quotes/abc`);
  check("public page 404 while disabled", off.status === 404 && unknown.status === 404 && offBody === stripNonce(await unknown.text()));

  await admin("/api/settings/integration", { method: "PUT", body: JSON.stringify({ publicPageEnabled: true }) });
  const on = await fetch(`${base}/public/quotes`);
  const html = await on.text();
  check("public page renders when enabled", on.ok && html.includes(`#${quote.id}`) && html.includes("Tester"));
  check("quote text is escaped", !html.includes("<script>alert(1)") && html.includes("&lt;script&gt;"));
  const csp = on.headers.get("content-security-policy") ?? "";
  check("strict CSP, no script", csp.includes("default-src 'none'") && !csp.includes("script-src"));
  check("public page leaks no admin fields", !html.includes("webui") && !html.includes("added"));
  check("single quote page", (await fetch(`${base}/public/quotes/${quote.id}`)).ok);
  const jump = await fetch(`${base}/public/quotes?n=${quote.id}`, { redirect: "manual" });
  check("jump-to-number redirects", jump.status === 302 && jump.headers.get("location") === `/public/quotes/${quote.id}`);

  // PUBLIC_PORT serves only the public page.
  check("PUBLIC_PORT serves the page", (await fetch(`${pub}/public/quotes`)).ok);
  check("PUBLIC_PORT has no API", (await fetch(`${pub}/api/integration/v1/ping`, { headers: auth })).status === 404);
  check("PUBLIC_PORT has no admin SPA/auth", (await fetch(`${pub}/api/auth/me`)).status === 404);

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
