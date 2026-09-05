import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api } from "../../api";
import { teacherPortalNav } from "./teacherPortalNav";

type ClassRow = { id: string; name: string; grade: string | null; studentCount: number };

type PracticeItem = {
  studentId: string;
  studentName: string;
  studentLoginId: string | null;
  classId: string;
  className: string;
  practiceStreak: number;
  bestPracticeStreak: number;
  lastPracticeDay: string | null;
  practicedOnDay: boolean;
  dailyChallengeCompleted: boolean;
  dailyChallengePct: number | null;
  levelTestCompleted: boolean;
  masteryCompleted: boolean;
  xpTotal: number;
};

type PracticeResponse = {
  dayKey: string;
  totalStudents: number;
  practicedCount: number;
  notPracticedCount: number;
  items: PracticeItem[];
};

type DatePreset = "today" | "yesterday" | "custom";
type StatusFilter = "all" | "practiced" | "not_practiced";

function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function activityBits(row: PracticeItem): string {
  const bits: string[] = [];
  if (row.dailyChallengeCompleted) {
    bits.push(
      row.dailyChallengePct != null
        ? `Daily 5 (${row.dailyChallengePct.toFixed(0)}%)`
        : "Daily 5"
    );
  }
  if (row.levelTestCompleted) bits.push("Level test");
  if (row.masteryCompleted) bits.push("Topic practice");
  return bits.length ? bits.join(" · ") : "—";
}

export function TeacherDailyPracticePage() {
  const { logout, auth } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("ALL");
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customDate, setCustomDate] = useState(todayLocalYmd);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [data, setData] = useState<PracticeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/teacher/classes");
      if (!r.ok) setErr(r.error ?? "Could not load classes");
      else setClasses(r.data ?? []);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      const q = new URLSearchParams();
      if (classId !== "ALL") q.set("classId", classId);
      q.set("preset", datePreset);
      if (datePreset === "custom") q.set("date", customDate);
      q.set("status", status);
      const r = await api<PracticeResponse>(`/api/v1/teacher/analytics/daily-practice?${q.toString()}`);
      setLoading(false);
      if (!r.ok) {
        setData(null);
        setErr(r.error ?? "Could not load daily practice");
        return;
      }
      setData(r.data ?? null);
    })();
  }, [classId, datePreset, customDate, status]);

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Teacher"}
      onLogout={logout}
      sidebarKicker="Daily practice"
      nav={[...teacherPortalNav]}
    >
      <h1 className="text-2xl font-bold text-slate-900">Daily practice</h1>
      <p className="text-slate-600 mt-1">
        See who practiced on a day and each student’s current practice streak (consecutive days). Practice
        includes Daily 5, level tests, and topic practice.
      </p>
      {err ? <p className="text-red-600 mt-3">{err}</p> : null}

      <section className="mt-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Class
          <select
            className="rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="ALL">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Show
          <select
            className="rounded-lg border px-3 py-2 text-sm text-slate-900"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="all">Everyone</option>
            <option value="practiced">Practiced that day</option>
            <option value="not_practiced">Did not practice</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["today", "Today"],
              ["yesterday", "Yesterday"],
              ["custom", "Pick date"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDatePreset(value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                datePreset === value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
          {datePreset === "custom" ? (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            />
          ) : null}
        </div>
      </section>

      {data ? (
        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">On {data.dayKey}</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{data.practicedCount}</p>
            <p className="text-sm text-slate-600">Practiced</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">On {data.dayKey}</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{data.notPracticedCount}</p>
            <p className="text-sm text-slate-600">Did not practice</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">In filter</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{data.totalStudents}</p>
            <p className="text-sm text-slate-600">Students</p>
          </div>
        </section>
      ) : null}

      <section className="mt-5 overflow-x-auto rounded-xl border bg-white shadow-sm">
        {loading ? <p className="p-4 text-sm text-slate-600">Loading…</p> : null}
        {!loading && data ? (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">Student</th>
                <th className="text-left p-3">Class</th>
                <th className="text-center p-3">That day</th>
                <th className="text-right p-3">Streak</th>
                <th className="text-right p-3">Best</th>
                <th className="text-left p-3">Last practice</th>
                <th className="text-left p-3">Activity that day</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-slate-500">
                    No students match this filter.
                  </td>
                </tr>
              ) : (
                data.items.map((row) => (
                  <tr key={row.studentId} className="border-t border-slate-100">
                    <td className="p-3">
                      <span className="font-medium text-slate-900">{row.studentName}</span>
                      {row.studentLoginId ? (
                        <span className="block text-xs text-slate-500">{row.studentLoginId}</span>
                      ) : null}
                    </td>
                    <td className="p-3">{row.className}</td>
                    <td className="p-3 text-center">
                      {row.practicedOnDay ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          No
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold text-slate-900">{row.practiceStreak}</td>
                    <td className="p-3 text-right text-slate-600">{row.bestPracticeStreak}</td>
                    <td className="p-3 whitespace-nowrap">{row.lastPracticeDay ?? "—"}</td>
                    <td className="p-3 text-slate-600">{activityBits(row)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}
      </section>
    </AppShell>
  );
}
