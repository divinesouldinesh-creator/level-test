import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { useAuth } from "../auth";

export function LoginPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"student" | "staff">("student");
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const r = await api<{ token: string; user: { role: string } }>("/api/v1/auth/login", {
      method: "POST",
      json: body,
    });
    setBusy(false);
    if (!r.ok || !r.data?.token) {
      setErr(r.error ?? "Login failed");
      return;
    }
    setToken(r.data.token);
    await refresh();
    const role = r.data.user.role;
    if (role === "STUDENT") nav("/student");
    else if (role === "TEACHER") nav("/teacher");
    else if (role === "ADMIN") nav("/admin");
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-gradient-to-b from-brand-50 to-slate-100">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-lg border border-slate-100 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-brand-900 text-center">Level Test</h1>
        <p className="text-slate-600 text-center mt-2 text-sm">School assessment — find weak topics</p>

        <p className="mt-4 text-xs text-slate-500 text-center leading-relaxed">
          <strong className="text-slate-600">Students:</strong> use your printed student ID here (e.g.{" "}
          <span className="font-mono">C12001</span>), not email. <strong className="text-slate-600">Teachers / admins:</strong>{" "}
          switch to the other tab and sign in with your school email.
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
            Teacher / Admin
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
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 text-base min-h-[48px]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
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
