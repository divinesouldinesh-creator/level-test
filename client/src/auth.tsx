import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

type Role = "ADMIN" | "TEACHER" | "STUDENT";

export type AuthState = {
  role: Role | null;
  loading: boolean;
  profile: {
    fullName?: string;
    studentId?: string;
    className?: string;
  } | null;
};

const Ctx = createContext<{
  auth: AuthState;
  refresh: () => Promise<void>;
  logout: () => void;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ role: null, loading: true, profile: null });

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setAuth({ role: null, loading: false, profile: null });
      return;
    }
    const r = await api<{
      role: Role;
      profile: { type: string; fullName: string; studentId?: string; className?: string } | null;
    }>("/api/v1/auth/me");
    if (!r.ok || !r.data) {
      setToken(null);
      setAuth({ role: null, loading: false, profile: null });
      return;
    }
    const p = r.data.profile;
    setAuth({
      role: r.data.role,
      loading: false,
      profile: p
        ? { fullName: p.fullName, studentId: p.studentId, className: p.className }
        : null,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    setToken(null);
    setAuth({ role: null, loading: false, profile: null });
  }, []);

  return <Ctx.Provider value={{ auth, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
