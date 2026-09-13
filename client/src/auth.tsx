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

const PROFILE_KEY = "authProfile";
const ROLES: Role[] = ["ADMIN", "TEACHER", "STUDENT", "OFFICE"];

const Ctx = createContext<{
  auth: AuthState;
  refresh: () => Promise<void>;
  applySession: (role: Role, profile: AuthState["profile"]) => void;
  logout: () => void;
} | null>(null);

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

function decodeJwtPayload(token: string): { role?: unknown; exp?: unknown } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as { role?: unknown; exp?: unknown };
  } catch {
    return null;
  }
}

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

function readCachedProfile(): AuthState["profile"] {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState["profile"];
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: AuthState["profile"]) {
  if (!profile) localStorage.removeItem(PROFILE_KEY);
  else localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function readInitialAuth(): AuthState {
  const token = getToken();
  if (!token) return { role: null, loading: false, profile: null };
  const payload = decodeJwtPayload(token);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  if (!payload || !isRole(payload.role) || (exp != null && exp * 1000 < Date.now())) {
    setToken(null);
    writeCachedProfile(null);
    return { role: null, loading: false, profile: null };
  }
  return { role: payload.role, loading: false, profile: readCachedProfile() };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(readInitialAuth);

  const applySession = useCallback((role: Role, profile: AuthState["profile"]) => {
    const next = profileFromLogin(profile);
    writeCachedProfile(next);
    setAuth({ role, loading: false, profile: next });
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      writeCachedProfile(null);
      setAuth({ role: null, loading: false, profile: null });
      return;
    }
    const r = await api<{
      role: Role;
      profile: { type: string; fullName: string; studentId?: string; className?: string } | null;
    }>("/api/v1/auth/me");
    if (!r.ok || !r.data) {
      setToken(null);
      writeCachedProfile(null);
      setAuth({ role: null, loading: false, profile: null });
      return;
    }
    const p = r.data.profile;
    const profile = profileFromLogin(p);
    writeCachedProfile(profile);
    setAuth({
      role: r.data.role,
      loading: false,
      profile,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    setToken(null);
    writeCachedProfile(null);
    setAuth({ role: null, loading: false, profile: null });
  }, []);

  return <Ctx.Provider value={{ auth, refresh, applySession, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
