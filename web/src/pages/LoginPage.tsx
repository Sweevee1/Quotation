import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext.js";

export default function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="topstripe" />
        <div className="login-card-body">
          <div className="login-brand">
            <div className="brand-mark">Q</div>
            <span className="brand-text">Quotation</span>
          </div>
          <h1>Sign in</h1>
          <p className="hint">Enter your WebUI password to manage the bot.</p>
          <form className="stack" onSubmit={handleSubmit} style={{ marginTop: 16 }}>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
