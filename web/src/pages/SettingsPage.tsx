import { useEffect, useState, type FormEvent } from "react";
import { ROLES, type CommandConfig, type CommandName, type Role, type TwitchSettings } from "@quotation/shared";
import { api } from "../api/client.js";
import { IconChevronDown } from "../icons.js";

function CommandRow({ config, onSave }: { config: CommandConfig; onSave: (name: CommandName, patch: Partial<CommandConfig>) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(config.enabled);
  const [permissionLevel, setPermissionLevel] = useState<Role>(config.permissionLevel);
  const [aliases, setAliases] = useState(config.aliases.join(", "));
  const [cooldownGlobalSec, setCooldownGlobalSec] = useState(config.cooldownGlobalSec);
  const [cooldownUserSec, setCooldownUserSec] = useState(config.cooldownUserSec);
  const [modsBypassCooldown, setModsBypassCooldown] = useState(config.modsBypassCooldown);
  const [responseTemplate, setResponseTemplate] = useState(config.responseTemplate);
  const [errorTemplate, setErrorTemplate] = useState(config.errorTemplate);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(config.commandName, {
        enabled,
        permissionLevel,
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        cooldownGlobalSec,
        cooldownUserSec,
        modsBypassCooldown,
        responseTemplate,
        errorTemplate,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
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
        <label className="row" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" className="switch" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="panel-title" style={{ fontFamily: "var(--font-mono)" }}>
            !{config.commandName}
          </span>
        </label>
        <div className="row" style={{ gap: 8 }}>
          {!expanded && (
            <span className="hint" style={{ margin: 0 }}>
              {permissionLevel}
            </span>
          )}
          <button className="btn" onClick={(e) => { e.stopPropagation(); handleSave(); }} disabled={saving}>
            {saved ? "Saved" : saving ? "Saving…" : "Save"}
          </button>
          <button
            className={`collapse-toggle${expanded ? " expanded" : ""}`}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            title={expanded ? "Collapse" : "Expand"}
          >
            <IconChevronDown />
          </button>
        </div>
      </div>

      {expanded && (
      <div className="panel-body">
        <div className="grid-2">
          <div>
            <label className="label">Minimum permission</label>
            <select className="input" value={permissionLevel} onChange={(e) => setPermissionLevel(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Aliases (comma-separated)</label>
            <input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="none" />
          </div>
          <div>
            <label className="label">Global cooldown (seconds)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={cooldownGlobalSec}
              onChange={(e) => setCooldownGlobalSec(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Per-user cooldown (seconds)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={cooldownUserSec}
              onChange={(e) => setCooldownUserSec(Number(e.target.value))}
            />
          </div>
        </div>

        <label className="row" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            className="switch"
            checked={modsBypassCooldown}
            onChange={(e) => setModsBypassCooldown(e.target.checked)}
          />
          <span className="hint" style={{ margin: 0 }}>
            Moderators and the broadcaster bypass cooldowns
          </span>
        </label>

        <div style={{ marginTop: 12 }}>
          <label className="label">Response format</label>
          <input className="input" value={responseTemplate} onChange={(e) => setResponseTemplate(e.target.value)} />
          <p className="hint">Placeholders: {"{id} {text} {author} {game} {date}"}</p>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="label">Not-found message</label>
          <input className="input" value={errorTemplate} onChange={(e) => setErrorTemplate(e.target.value)} />
        </div>
      </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [twitch, setTwitch] = useState<TwitchSettings | null>(null);
  const [channel, setChannel] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [twitchSaving, setTwitchSaving] = useState(false);
  const [twitchSaved, setTwitchSaved] = useState(false);
  const [twitchError, setTwitchError] = useState<string | null>(null);

  const [commands, setCommands] = useState<CommandConfig[]>([]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [twitchExpanded, setTwitchExpanded] = useState(false);
  const [passwordExpanded, setPasswordExpanded] = useState(false);

  useEffect(() => {
    api.getTwitchSettings().then((t) => {
      setTwitch(t);
      setChannel(t.channel);
      setClientId(t.clientId);
    });
    api.getCommandConfigs().then(setCommands);
  }, []);

  async function handleSaveTwitch(e: FormEvent) {
    e.preventDefault();
    setTwitchSaving(true);
    setTwitchError(null);
    try {
      await api.updateTwitchSettings({
        channel,
        clientId,
        ...(clientSecret ? { clientSecret } : {}),
      });
      setClientSecret("");
      const updated = await api.getTwitchSettings();
      setTwitch(updated);
      setTwitchSaved(true);
      setTimeout(() => setTwitchSaved(false), 1500);
    } catch (err) {
      setTwitchError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setTwitchSaving(false);
    }
  }

  async function handleDisconnectAuth() {
    await api.disconnectTwitchAuth();
    const updated = await api.getTwitchSettings();
    setTwitch(updated);
  }

  async function handleSaveCommand(name: CommandName, patch: Partial<CommandConfig>) {
    const updated = await api.updateCommandConfig(name, patch);
    setCommands((prev) => prev.map((c) => (c.commandName === name ? updated : c)));
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMsg({ text: "Password updated.", ok: true });
    } catch (err) {
      setPasswordMsg({ text: err instanceof Error ? err.message : "Failed to change password", ok: false });
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Twitch connection, command behavior, and WebUI access.</p>
        </div>
      </div>

      <div className="page-header" style={{ marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 14 }}>Commands</h1>
        </div>
      </div>
      <div className="stack">
        {commands.map((c) => (
          <CommandRow key={c.commandName} config={c} onSave={handleSaveCommand} />
        ))}
      </div>

      <div className="panel" style={{ marginTop: 26 }}>
        <div
          className="panel-header panel-header-toggle"
          onClick={() => setTwitchExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          aria-expanded={twitchExpanded}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setTwitchExpanded((v) => !v);
            }
          }}
        >
          <span className="panel-title">Twitch</span>
          <div className="row" style={{ gap: 8 }}>
            {!twitchExpanded && (
              <span className="hint" style={{ margin: 0 }}>
                {twitch?.botLogin ? `authorized as ${twitch.botLogin}` : twitch?.channel || "not configured"}
              </span>
            )}
            <button
              className={`collapse-toggle${twitchExpanded ? " expanded" : ""}`}
              onClick={(e) => { e.stopPropagation(); setTwitchExpanded((v) => !v); }}
              title={twitchExpanded ? "Collapse" : "Expand"}
            >
              <IconChevronDown />
            </button>
          </div>
        </div>
        {twitchExpanded && (
        <div className="panel-body">
          <form className="stack" onSubmit={handleSaveTwitch}>
            <div className="grid-2">
              <div>
                <label className="label">Channel</label>
                <input className="input" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="yourchannel" />
                <p className="hint">Your Twitch username, e.g. twitch.tv/<strong>yourchannel</strong></p>
              </div>
              <div>
                <label className="label">Client ID</label>
                <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Client secret</label>
              <input
                className="input"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={twitch?.hasClientSecret ? "•••••••• (saved — leave blank to keep)" : ""}
              />
            </div>
            <p className="hint">
              Get your Client ID and Client Secret by registering an app at{" "}
              <a
                className="link"
                href="https://dev.twitch.tv/console/apps"
                target="_blank"
                rel="noreferrer"
              >
                dev.twitch.tv/console/apps
              </a>
              .
            </p>
            <div className="info-box">
              <p className="info-box-title">OAuth Redirect URLs</p>
              <p className="hint" style={{ margin: 0 }}>
                When registering the app, add these under <strong>OAuth Redirect URLs</strong> (you can list
                more than one — add both if you use this both locally and on a server):
              </p>
              <ul className="info-box-list">
                <li>
                  Local dev: <code>http://localhost:8766/twitch/callback</code>
                </li>
                <li>
                  Your server: <code>https://your-server-address:8766/twitch/callback</code>
                </li>
              </ul>
              <p className="hint" style={{ margin: 0 }}>
                Replace <code>your-server-address</code> with the domain or IP you'll actually reach this
                WebUI at once deployed. Leave the port as <code>8766</code> unless you changed it in your
                deployment config.
              </p>
              <p className="hint" style={{ margin: 0 }}>
                Twitch requires that server URL to be <strong>https</strong> — it won't accept plain http for
                anything but literal localhost. If you're not behind a reverse proxy with a real certificate
                (e.g. reaching this over a bare LAN IP), see the README's "HTTPS for Twitch OAuth without a
                reverse proxy" section for a bundled self-signed option instead.
              </p>
            </div>
            {twitchError && <p className="error-text">{twitchError}</p>}
            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={twitchSaving}>
                {twitchSaved ? "Saved" : twitchSaving ? "Saving…" : "Save"}
              </button>
              {twitch?.botLogin && (
                <>
                  <span className="hint">Bot authorized as {twitch.botLogin}</span>
                  <button type="button" className="btn btn-danger" onClick={handleDisconnectAuth}>
                    Remove authorization
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div
          className="panel-header panel-header-toggle"
          onClick={() => setPasswordExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          aria-expanded={passwordExpanded}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setPasswordExpanded((v) => !v);
            }
          }}
        >
          <span className="panel-title">WebUI password</span>
          <button
            className={`collapse-toggle${passwordExpanded ? " expanded" : ""}`}
            onClick={(e) => { e.stopPropagation(); setPasswordExpanded((v) => !v); }}
            title={passwordExpanded ? "Collapse" : "Expand"}
          >
            <IconChevronDown />
          </button>
        </div>
        {passwordExpanded && (
        <div className="panel-body">
          <form className="stack" onSubmit={handleChangePassword}>
            <div>
              <label className="label">Current password</label>
              <input
                className="input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label">New password</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {passwordMsg && <p className={passwordMsg.ok ? "hint" : "error-text"}>{passwordMsg.text}</p>}
            <button className="btn" type="submit" disabled={!currentPassword || !newPassword}>
              Update password
            </button>
          </form>
        </div>
        )}
      </div>
    </div>
  );
}
