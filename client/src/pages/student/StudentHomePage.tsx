import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";

type Engagement = {
  dayKey: string;
  xpTotal: number;
  checkInStreak: number;
  bestCheckInStreak: number;
  practiceStreak: number;
  bestPracticeStreak: number;
  checkedInToday: boolean;
  practicedToday: boolean;
};

type DailyChallengeSummary = {
  id: string;
  dayKey: string;
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

type MasteryQueueItem = {
  masteryId: string;
  topicName: string;
  subjectName: string;
  levelName: string;
  status: string;
  accuracyPct: number | null;
  nextStep: "learn" | "practice" | "recheck" | "done";
};

type HomePayload = {
  engagement: Engagement;
  dailyChallenge: DailyChallengeSummary;
  masteryQueue: MasteryQueueItem[];
};

function masteryStatusLabel(s: string) {
  if (s === "REVIEW_DUE") return "Recheck due";
  if (s === "NEEDS_WORK") return "Needs work";
  if (s === "PRACTICING") return "Practicing";
  if (s === "LEARNING") return "Learning";
  return s;
}

function nextStepLabel(s: MasteryQueueItem["nextStep"]) {
  if (s === "learn") return "Learn";
  if (s === "practice") return "Practice";
  if (s === "recheck") return "Recheck";
  return "Done";
}

export function StudentHomePage() {
  const { logout, auth } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<HomePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  async function checkIn() {
    setBusy(true);
    const r = await api<{
      alreadyCheckedIn: boolean;
      xpAwarded: number;
      xpTotal: number;
      checkInStreak: number;
    }>("/api/v1/student/check-in", { method: "POST" });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Check-in failed");
      return;
    }
    await load();
  }

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

  const e = data?.engagement;
  const c = data?.dailyChallenge;
  const masteryQueue = data?.masteryQueue ?? [];

  return (
    <AppShell title={headerTitle} onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
      <h1 className="text-2xl font-bold text-slate-900">Today</h1>
      <p className="mt-1 text-slate-600">
        Check in, fix weak topics, and finish your Daily 5.
      </p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {!data ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <>
          <section className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total XP</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{e?.xpTotal ?? 0}</p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">
                Check-in streak
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{e?.checkInStreak ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Best: {e?.bestCheckInStreak ?? 0}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Practice streak
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{e?.practiceStreak ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Best: {e?.bestPracticeStreak ?? 0}</p>
            </div>
          </section>

          <section className="mt-5 rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Fix these topics</h2>
            <p className="mt-1 text-sm text-slate-600">
              Learn → Practice (≥70%) → Recheck (≥80%) → Mastered (+25 XP)
            </p>
            {masteryQueue.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No weak topics right now. Take skill tests or Daily 5 — weak topics will appear here.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {masteryQueue.slice(0, 5).map((m) => (
                  <li key={m.masteryId}>
                    <button
                      type="button"
                      onClick={() => navigate(`/student/mastery/${m.masteryId}`)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-100 bg-white px-4 py-3 text-left hover:border-rose-300"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{m.topicName}</p>
                        <p className="text-xs text-slate-500">
                          {m.subjectName} · {m.levelName} · {masteryStatusLabel(m.status)}
                          {m.accuracyPct != null ? ` · ${m.accuracyPct}%` : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white">
                        {nextStepLabel(m.nextStep)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Daily check-in</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {e?.checkedInToday
                    ? "You're checked in for today. Come back tomorrow!"
                    : "Tap once to earn +5 XP and grow your streak."}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || !!e?.checkedInToday}
                onClick={() => void checkIn()}
                className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {e?.checkedInToday ? "Checked in ✓" : "Check in (+5 XP)"}
              </button>
            </div>
          </section>

          <section className="mt-5 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Daily 5</p>
            {c ? (
              <>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  {c.subjectName} · {c.levelName}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {c.questionCount} questions
                  {c.focusTopicNames.length > 0
                    ? ` · Focus: ${c.focusTopicNames.join(", ")}`
                    : ""}
                </p>
                {c.status === "COMPLETED" ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <p className="text-sm font-medium text-emerald-800">
                      Done — {c.score}/{c.maxScore} ({c.percentage}%) · +{c.xpAwarded ?? 0} XP
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(`/student/daily/${c.id}`)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
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
                    Start Daily 5
                  </button>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                No challenge available yet. Skill subjects need questions configured for your class.
              </p>
            )}
          </section>

          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            <Link
              to="/student/skills"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500"
            >
              <p className="font-semibold text-slate-900">Skill subjects</p>
              <p className="mt-1 text-sm text-slate-600">Levels & full tests</p>
            </Link>
            <Link
              to="/student/syllabus"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500"
            >
              <p className="font-semibold text-slate-900">Syllabus</p>
              <p className="mt-1 text-sm text-slate-600">Chapter practice</p>
            </Link>
            <Link
              to="/student/attendance"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500"
            >
              <p className="font-semibold text-slate-900">Attendance</p>
              <p className="mt-1 text-sm text-slate-600">Your streak & reports</p>
            </Link>
          </section>
        </>
      )}
    </AppShell>
  );
}
