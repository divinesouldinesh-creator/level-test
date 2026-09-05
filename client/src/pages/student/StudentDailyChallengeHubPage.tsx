import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";

type DailyChallengeSummary = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  subjectName: string;
  levelName: string;
  focusTopicNames: string[];
  questionCount: number;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  xpAwarded: number | null;
} | null;

type HomePayload = {
  dailyChallenge: DailyChallengeSummary;
};

export function StudentDailyChallengeHubPage() {
  const { logout, auth } = useAuth();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState<DailyChallengeSummary>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await api<HomePayload>("/api/v1/student/home");
    setLoading(false);
    if (!r.ok) {
      setErr(r.error ?? "Failed to load");
      return;
    }
    setChallenge(r.data?.dailyChallenge ?? null);
    setErr(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startChallenge() {
    setBusy(true);
    const r = await api<{ id: string }>("/api/v1/student/daily-challenge/start", { method: "POST" });
    setBusy(false);
    if (!r.ok || !r.data?.id) {
      setErr(r.error ?? "Could not start daily challenge");
      return;
    }
    navigate(`/student/daily/${r.data.id}`);
  }

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Student"}
      onLogout={logout}
      nav={[...studentNav]}
      sidebarKicker="Student"
    >
      <Link to="/student" className="text-sm font-medium text-brand-700">
        ← Home
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Daily Challenge</h1>
      <p className="mt-1 text-slate-600">Five quick questions — keep your practice streak going.</p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <section className="mt-6 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 shadow-sm">
          {challenge ? (
            <>
              <h2 className="text-xl font-bold text-slate-900">
                {challenge.subjectName} · {challenge.levelName}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {challenge.questionCount} questions
                {challenge.focusTopicNames.length > 0
                  ? ` · Focus: ${challenge.focusTopicNames.join(", ")}`
                  : ""}
              </p>
              {challenge.status === "COMPLETED" ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <p className="text-sm font-medium text-emerald-800">
                    Done — {challenge.score}/{challenge.maxScore} ({challenge.percentage}%) · +
                    {challenge.xpAwarded ?? 0} XP
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(`/student/daily/${challenge.id}`)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
                  >
                    Review
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startChallenge()}
                  className="mt-4 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Starting…" : "Start Daily 5"}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600">
              No challenge available yet. Ask your teacher to add skill questions for your class.
            </p>
          )}
        </section>
      )}
    </AppShell>
  );
}
