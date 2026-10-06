import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { useAuth, type Role } from "../auth";

export function LoginPage() {
  const nav = useNavigate();
  const { applySession } = useAuth();
  const [mode, setMode] = useState<"student" | "staff">("student");
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const sid = studentId.trim();
    const em = email.trim();
    const pwd = password;
    const body =
      mode === "student"
        ? { studentId: sid, password: pwd }
        : { email: em, password: pwd };
    const r = await api<{
      token: string;
      user: {
        role: Role;
        profile: { fullName?: string; studentId?: string; className?: string } | null;
      };
    }>("/api/v1/auth/login", {
      method: "POST",
      json: body,
    });
    setBusy(false);
    if (!r.ok || !r.data?.token) {
      setErr(r.error ?? "Login failed");
      return;
    }
    setToken(r.data.token);
    applySession(r.data.user.role, r.data.user.profile ?? null);
    const role = r.data.user.role;
    if (role === "STUDENT") nav("/student");
    else if (role === "TEACHER") nav("/teacher");
    else if (role === "ADMIN") nav("/admin");
    else if (role === "OFFICE") nav("/office");
    else if (role === "PRINCIPAL") nav("/principal");
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-gradient-to-b from-brand-50 to-slate-100">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-lg border border-slate-100 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-brand-900 text-center">Level Test</h1>
        <p className="text-slate-600 text-center mt-2 text-sm">School assessment — find weak topics</p>

        <p className="mt-4 text-xs text-slate-500 text-center leading-relaxed">
          <strong className="text-slate-600">Students:</strong> use your printed student ID here (e.g.{" "}
          <span className="font-mono">C12001</span>), not email.{" "}
          <strong className="text-slate-600">Teachers / office / admins:</strong> switch to the other tab and
          sign in with your school email.
        </p>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            className={`flex-1 rounded-lg py-3 text-base font-medium min-h-[48px] ${
              mode === "student" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
            onClick={() => setMode("student")}
          >
            Student
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-3 text-base font-medium min-h-[48px] ${
              mode === "staff" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
            onClick={() => setMode("staff")}
          >
            Staff
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "student" ? (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Student ID</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-base min-h-[48px]"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-base min-h-[48px]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
          )}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 pr-12 text-base min-h-[48px]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M3 3l18 18" strokeLinecap="round" />
                    <path d="M10.6 10.6a2 2 0 002.8 2.8" strokeLinecap="round" />
                    <path
                      d="M9.9 5.1A10.8 10.8 0 0112 5c5 0 9.3 3.1 11 7-1 2.2-2.7 4.1-4.8 5.4M6.1 6.1C4.2 7.4 2.7 9.1 2 12c1.7 3.9 6 7 10 7 1.6 0 3.1-.3 4.5-.9"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-600 text-white py-4 text-lg font-semibold min-h-[52px] disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
