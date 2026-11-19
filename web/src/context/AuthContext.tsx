import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client.js";

interface AuthContextValue {
  authed: boolean | null;
  needsSetup: boolean;
  setup: (password: string) => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setNeedsSetup(r.needsSetup);
        setAuthed(r.authed);
      })
      .catch(() => setAuthed(false));
  }, []);

  const login = useCallback(async (password: string) => {
    await api.login(password);
    setAuthed(true);
  }, []);

  const setup = useCallback(async (password: string) => {
    await api.setup(password);
    setNeedsSetup(false);
    setAuthed(true);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setAuthed(false);
  }, []);

  return <AuthContext.Provider value={{ authed, needsSetup, setup, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
