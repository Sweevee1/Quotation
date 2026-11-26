import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { copyText } from "../clipboard.js";
import { IconChevronDown } from "../icons.js";

interface IntegrationState {
  hasApiKey: boolean;
  publicPageEnabled: boolean;
  publicPath: string;
}

/**
 * Settings panel for linking Quotation to SweevElements (API key) and for publishing the
 * standalone public quotes page. The plaintext key is only ever shown right after generating it.
 */
export default function IntegrationPanel() {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<IntegrationState | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getIntegration().then(setState).catch(() => setError("Could not load integration settings."));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setState(await api.getIntegration());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const publicUrl = state ? `${window.location.origin}${state.publicPath}` : "";

  async function copy(text: string) {
    if (await copyText(text)) {
      setError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setError("Copy failed. Select the key and copy it manually.");
    }
  }

  const summary = state
    ? [state.hasApiKey ? "API key set" : "no API key", state.publicPageEnabled ? "public page on" : "public page off"].join(" · ")
    : "";

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div
        className="panel-header panel-header-toggle"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        <span className="panel-title">Integrations &amp; public page</span>
        <div className="row" style={{ gap: 8 }}>
          {!expanded && (
            <span className="hint" style={{ margin: 0 }}>
              {summary}
            </span>
          )}
          <button
            className={`collapse-toggle${expanded ? " expanded" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            title={expanded ? "Collapse" : "Expand"}
          >
            <IconChevronDown />
          </button>
        </div>
      </div>
      {expanded && state && (
        <div className="panel-body">
          <div className="stack">
            <div>
              <label className="label">SweevElements link</label>
              <p className="hint">
                In SweevElements open <strong>Settings &rarr; Quotation</strong> and enter this app&apos;s address
                (for example <code>http://192.168.1.10:8766</code>) plus an API key. SweevElements then serves your
                quotes at <code>/&lt;channel&gt;/quotes</code> next to the tip page. The key only allows reading
                quote numbers, text, author, game and date.
              </p>
              {newKey && (
                <div className="stack" style={{ marginTop: 8 }}>
                  <input
                    className="input"
                    readOnly
                    value={newKey}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="New API key"
                    style={{ fontFamily: "var(--font-mono)" }}
                  />
                  <p className="hint">Copy this key now. It is not shown again, only a hash is stored.</p>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn" type="button" onClick={() => copy(newKey)}>
                      {copied ? "Copied" : "Copy key"}
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={() => setNewKey(null)}>
                      Hide
                    </button>
                  </div>
                </div>
              )}
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setNewKey((await api.generateApiKey()).apiKey);
                    })
                  }
                >
                  {state.hasApiKey ? "Regenerate API key" : "Generate API key"}
                </button>
                {state.hasApiKey && (
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api.revokeApiKey();
                        setNewKey(null);
                      })
                    }
                  >
                    Revoke key
                  </button>
                )}
              </div>
              {state.hasApiKey && (
                <p className="hint">Regenerating or revoking disconnects any app using the old key.</p>
              )}
            </div>

            <div>
              <label className="label">Public quotes page (without SweevElements)</label>
              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  className="switch"
                  checked={state.publicPageEnabled}
                  disabled={busy}
                  onChange={(e) => run(() => api.setPublicPageEnabled(e.target.checked).then(() => undefined))}
                />
                <span>Publish a read-only list of quotes</span>
              </label>
              <p className="hint">
                Shows quote number, text, author, game and date. It never shows who added a quote.
              </p>
              {state.publicPageEnabled && (
                <p className="hint">
                  Address: <a className="link" href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a>
                </p>
              )}
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
