import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { BotProfiles, BotStatus } from "@quotation/shared";
import { api } from "../api/client.js";
import { useBotEvents } from "../context/BotEventsContext.js";

function statusLabel(status: BotStatus["status"]): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "error":
      return "Error";
    default:
      return "Offline";
  }
}

function ProfileRow({
  label,
  displayName,
  profileImageUrl,
  placeholder,
  action,
}: {
  label: string;
  displayName: string | null;
  profileImageUrl: string | null;
  placeholder: string;
  action?: ReactNode;
}) {
  return (
    <div className="profile-row">
      {profileImageUrl ? (
        <img className="profile-avatar" src={profileImageUrl} alt="" />
      ) : (
        <div className="profile-avatar profile-avatar-empty" />
      )}
      <div className="profile-info">
        <div className="profile-label">{label}</div>
        <div className="profile-name">{displayName || placeholder}</div>
      </div>
      {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<BotProfiles | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const events = useBotEvents();

  const refresh = useCallback(() => {
    api.getBotStatus().then(setStatus).catch(() => undefined);
    api.getTwitchAuthStatus().then((r) => setAuthorized(r.authorized)).catch(() => undefined);
    api.getBotProfiles().then(setProfiles).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Re-check status shortly after any "status" event lands (covers auto-connect/reconnect/OAuth).
  useEffect(() => {
    if (events[0]?.type === "status") refresh();
  }, [events, refresh]);

  async function handleConnectTwitch() {
    setOauthBusy(true);
    setError(null);
    try {
      const { authUrl } = await api.startTwitchOAuth();
      const popup = window.open(authUrl, "twitch-oauth", "width=480,height=720");
      const onMessage = (e: MessageEvent) => {
        if (e.origin === window.location.origin && typeof e.data === "string" && e.data.startsWith("twitch-oauth-")) {
          window.removeEventListener("message", onMessage);
          refresh();
          setOauthBusy(false);
        }
      };
      window.addEventListener("message", onMessage);
      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll);
          window.removeEventListener("message", onMessage);
          refresh();
          setOauthBusy(false);
        }
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start Twitch authorization");
      setOauthBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Bot status and recent chat command activity.</p>
        </div>
        <span className="pill">
          <span className={`status-dot ${status?.status ?? ""}`} />
          {status ? statusLabel(status.status) : "…"}
        </span>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Connection</span>
          </div>
          <div className="panel-body">
            <ProfileRow
              label="Streamer"
              displayName={profiles?.streamer?.displayName ?? null}
              profileImageUrl={profiles?.streamer?.profileImageUrl ?? null}
              placeholder={status?.channel ? status.channel : "No channel configured"}
            />
            <ProfileRow
              label="Bot"
              displayName={profiles?.bot?.displayName ?? null}
              profileImageUrl={profiles?.bot?.profileImageUrl ?? null}
              placeholder={authorized ? "Loading…" : "Not authorized"}
              action={
                <button className="btn btn-ghost" onClick={handleConnectTwitch} disabled={oauthBusy}>
                  {oauthBusy ? "Waiting for Twitch…" : authorized ? "Re-authorize" : "Connect with Twitch"}
                </button>
              }
            />
            {status?.error && <p className="error-text" style={{ marginTop: 10 }}>{status.error}</p>}
            {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Quotes</span>
          </div>
          <div className="panel-body">
            <div className="stat">{status?.quoteCount ?? "–"}</div>
            <div className="stat-label">saved</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Live activity</span>
        </div>
        <div className="log">
          {events.length === 0 && <div className="log-empty">Nothing yet — activity will appear here.</div>}
          {events.map((e, i) => (
            <div className="log-entry" key={`${e.timestamp}-${i}`}>
              <span className="log-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
              <span className={`log-type ${e.type}`}>{e.type.replace("_", " ")}</span>
              <span className="log-msg">{e.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
