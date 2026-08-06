import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client.js";

interface AuthContextValue {
  authed: boolean | null;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setAuthed(r.authed))
      .catch(() => setAuthed(false));
  }, []);

  const login = useCallback(async (password: string) => {
    await api.login(password);
    setAuthed(true);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setAuthed(false);
  }, []);

  return <AuthContext.Provider value={{ authed, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
