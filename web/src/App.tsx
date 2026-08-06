import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.js";
import { BotEventsProvider } from "./context/BotEventsContext.js";
import { IconArchive, IconDashboard, IconLogout, IconQuotes, IconSettings } from "./icons.js";
import LoginPage from "./pages/LoginPage.js";
import DashboardPage from "./pages/DashboardPage.js";
import QuotesPage from "./pages/QuotesPage.js";
import BackupsPage from "./pages/BackupsPage.js";
import SettingsPage from "./pages/SettingsPage.js";

export default function App() {
  const { authed, logout } = useAuth();

  if (authed === null) {
    return <div className="login-screen">Loading…</div>;
  }

  if (!authed) {
    return <LoginPage />;
  }

  return (
    <BotEventsProvider>
    <div className="app-shell">
      <div className="topstripe" />
      <nav className="nav-rail">
        <div className="brand-bar">
          <div className="brand-mark">Q</div>
          <span className="brand-text">Quotation</span>
        </div>
        <div className="nav-list">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <IconDashboard />
            Dashboard
          </NavLink>
          <NavLink to="/quotes" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <IconQuotes />
            Quotes
          </NavLink>
          <NavLink to="/backups" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <IconArchive />
            Backups
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <IconSettings />
            Settings
          </NavLink>
        </div>
        <div className="nav-footer">
          <button className="btn btn-ghost" onClick={() => logout()} style={{ width: "100%" }}>
            <span className="row" style={{ justifyContent: "center" }}>
              <IconLogout style={{ width: 13, height: 13 }} />
              Log out
            </span>
          </button>
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/backups" element={<BackupsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
    </BotEventsProvider>
  );
}
