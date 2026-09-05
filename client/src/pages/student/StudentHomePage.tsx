import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";

type Engagement = {
  xpTotal: number;
  practiceStreak: number;
  bestPracticeStreak: number;
};

type HomePayload = {
  engagement: Engagement;
};

export function StudentHomePage() {
  const { logout, auth } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<HomePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const headerTitle =
    [auth.profile?.fullName, auth.profile?.className].filter(Boolean).join(" · ") || "Student";

  const load = useCallback(async () => {
    const r = await api<HomePayload>("/api/v1/student/home");
    if (!r.ok) {
      setErr(r.error ?? "Failed to load home");
      return;
    }
    setData(r.data ?? null);
    setErr(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const e = data?.engagement;

  return (
    <AppShell title={headerTitle} onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
      <h1 className="text-2xl font-bold text-slate-900">Home</h1>
      <p className="mt-1 text-slate-600">Pick a subject to learn, or try today&apos;s challenge.</p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {!data ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <>
          <section className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total XP</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{e?.xpTotal ?? 0}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Practice streak
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{e?.practiceStreak ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Best: {e?.bestPracticeStreak ?? 0} days</p>
            </div>
          </section>

          <section className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate("/student/subjects")}
              className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-brand-500"
            >
              <p className="text-lg font-semibold text-slate-900">Subjects</p>
              <p className="mt-1 text-sm text-slate-600">Maths, English — learn and take tests</p>
            </button>
            <button
              type="button"
              onClick={() => navigate("/student/daily")}
              className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 text-left shadow-sm hover:border-indigo-400"
            >
              <p className="text-lg font-semibold text-slate-900">Daily Challenge</p>
              <p className="mt-1 text-sm text-slate-600">5 quick questions for today</p>
            </button>
            <Link
              to="/student/attendance"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-500 sm:col-span-2"
            >
              <p className="text-lg font-semibold text-slate-900">Attendance</p>
              <p className="mt-1 text-sm text-slate-600">Your attendance report and streak</p>
            </Link>
          </section>
        </>
      )}
    </AppShell>
  );
}
