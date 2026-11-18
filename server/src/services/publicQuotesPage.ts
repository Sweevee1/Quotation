import type { PublicQuote } from "./integrationService.js";

export const PUBLIC_QUOTES_BASE = "/public/quotes";

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Same date format as the `{date}` chat template variable. */
function chatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US");
}

export function cspHeader(nonce: string): string {
  return `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`;
}

// Quotation's own look (tokens copied from web/src/styles.css): navy surfaces, green accent.
const CSS = `
:root{color-scheme:dark;--bg:#12151c;--panel:#1a1f29;--panel-header:#1e2430;--row-hover:#212836;--line:#262c3a;--accent:#22c55e;--text:#e7e9ee;--text-dim:#9aa1b1;--text-faint:#5b6274}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:var(--text-dim);margin:0 0 20px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.tools{display:flex;gap:8px;flex-wrap:wrap;padding:12px;background:var(--panel-header);border-bottom:1px solid var(--line)}
.tools form{display:flex;gap:6px;flex:1 1 220px}
input{flex:1;min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:7px 10px;font:inherit}
input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button{background:var(--accent);color:#04130a;border:0;border-radius:6px;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer}
ol{list-style:none;margin:0;padding:0}
li{display:flex;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line)}
li:last-child{border-bottom:0}
li:hover{background:var(--row-hover)}
.num{flex:none;min-width:3.2em;font-family:ui-monospace,Consolas,monospace;color:var(--accent);text-decoration:none;font-weight:600}
.body{min-width:0;overflow-wrap:anywhere}
.meta{color:var(--text-dim);font-size:12.5px}
.empty{padding:28px;text-align:center;color:var(--text-dim)}
nav.pager{display:flex;justify-content:space-between;align-items:center;margin-top:14px;color:var(--text-dim)}
.chat{margin:16px 0 0;padding:10px 12px;background:var(--panel-header);border:1px solid var(--line);border-radius:6px;font-family:ui-monospace,Consolas,monospace;font-size:13px;color:var(--text-dim)}
.back{display:inline-block;margin-bottom:14px}
a{color:var(--accent)}
`;

function shell(title: string, nonce: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="darkreader-lock"><title>${esc(title)}</title><style nonce="${nonce}">${CSS}</style></head><body><main>${body}</main></body></html>`;
}

function quoteLine(q: PublicQuote): string {
  const date = chatDate(q.createdAt);
  const meta = [`— ${esc(q.author)}`, q.game ? `[${esc(q.game)}]` : "", date ? `[${esc(date)}]` : ""]
    .filter(Boolean)
    .join(" ");
  return `<li id="q${q.id}"><a class="num" href="${PUBLIC_QUOTES_BASE}/${q.id}">#${q.id}</a><div class="body"><div>${esc(q.text)}</div><div class="meta">${meta}</div></div></li>`;
}

export function renderQuoteList(
  nonce: string,
  opts: { items: PublicQuote[]; total: number; page: number; pageSize: number; search: string },
): string {
  const { items, total, page, pageSize, search } = opts;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (p: number) => `?${search ? `q=${encodeURIComponent(search)}&amp;` : ""}page=${p}`;
  const pager =
    pages > 1
      ? `<nav class="pager" aria-label="Pagination">${page > 1 ? `<a href="${qs(page - 1)}">&larr; Newer</a>` : "<span></span>"}<span>Page ${page} of ${pages}</span>${page < pages ? `<a href="${qs(page + 1)}">Older &rarr;</a>` : "<span></span>"}</nav>`
      : "";
  const list = items.length
    ? `<ol>${items.map(quoteLine).join("")}</ol>`
    : `<div class="empty">${search ? "No quotes match your search." : "No quotes yet."}</div>`;
  return shell(
    "Quotes",
    nonce,
    `<h1>Quotes</h1><p class="sub">${total} quote${total === 1 ? "" : "s"}. Use <code>!quote N</code> in chat to show one.</p>
<div class="panel"><div class="tools">
<form method="get" action="${PUBLIC_QUOTES_BASE}" role="search"><input type="search" name="q" value="${esc(search)}" placeholder="Search quotes" aria-label="Search quotes" maxlength="100"><button type="submit">Search</button></form>
<form method="get" action="${PUBLIC_QUOTES_BASE}"><input type="number" name="n" min="1" placeholder="Quote #" aria-label="Quote number"><button type="submit">Go</button></form>
</div>${list}</div>${pager}`,
  );
}

export function renderSingleQuote(nonce: string, q: PublicQuote): string {
  return shell(
    `Quote #${q.id}`,
    nonce,
    `<a class="back" href="${PUBLIC_QUOTES_BASE}">&larr; All quotes</a><h1>Quote #${q.id}</h1>
<div class="panel"><ol>${quoteLine(q)}</ol></div>
<p class="chat">!quote ${q.id}</p>`,
  );
}

export function renderNotFound(nonce: string): string {
  return shell("Not found", nonce, `<h1>Not found</h1><p class="sub">There is nothing here.</p>`);
}
