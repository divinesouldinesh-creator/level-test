import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

export type Role = "ADMIN" | "TEACHER" | "STUDENT" | "OFFICE";

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
  applySession: (role: Role, profile: AuthState["profile"]) => void;
  logout: () => void;
} | null>(null);

function profileFromLogin(
  p: { fullName?: string; studentId?: string; className?: string } | null
): AuthState["profile"] {
  if (!p) return null;
  return {
    fullName: p.fullName,
    studentId: p.studentId,
    className: p.className,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ role: null, loading: true, profile: null });

  const applySession = useCallback((role: Role, profile: AuthState["profile"]) => {
    setAuth({ role, loading: false, profile: profileFromLogin(profile) });
  }, []);

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
      profile: profileFromLogin(p),
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    setToken(null);
    setAuth({ role: null, loading: false, profile: null });
  }, []);

  return <Ctx.Provider value={{ auth, refresh, applySession, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
