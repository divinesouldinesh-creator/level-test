import { useEffect, useState } from "react";
import { api } from "../../api";

type Summary = {
  studentCount: number;
  activeWindowDays: number;
  studentsUsedRecentlyCount: number;
  classActivity: { className?: string; students: number; activeStudents: number }[];
  today?: {
    dayKey: string;
    loggedIn: number;
    completed: number;
    leftWithoutCompleting: number;
  };
};

export function AdminHome() {
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<Summary>("/api/v1/admin/dashboard/summary");
      if (!r.ok) setErr(r.error ?? "Failed");
      else setData(r.data ?? null);
    })();
  }, []);

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Admin dashboard</h1>
      <p className="text-slate-600 mt-1">School-wide usage. Totals only.</p>
      {err && <p className="text-red-600 mt-4">{err}</p>}
      {data && (
        <>
          {data.today ? (
            <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-slate-900">
                Today{data.today.dayKey ? ` · ${data.today.dayKey}` : ""}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Logged in vs finished Daily 5, a test, or topic practice.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <TodayStat label="Logged in" value={data.today.loggedIn} />
                <TodayStat label="Completed" value={data.today.completed} />
                <TodayStat
                  label="Left without completing"
                  value={data.today.leftWithoutCompleting}
                  warn={data.today.leftWithoutCompleting > 0}
                />
              </div>
            </section>
          ) : null}
          <p className="mt-4 text-lg">
            Students: <strong>{data.studentCount}</strong>
          </p>
          <p className="mt-1 text-lg">
            Students active in last {data.activeWindowDays} days: <strong>{data.studentsUsedRecentlyCount}</strong>
          </p>
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold mb-2">Class-wise usage (last {data.activeWindowDays} days)</h2>
            <ul className="divide-y divide-slate-100">
              {data.classActivity.map((c) => (
                <li key={c.className} className="py-3 flex justify-between text-base">
                  <span>{c.className}</span>
                  <span className="font-medium">
                    {c.activeStudents} active / {c.students} students
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

function TodayStat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${warn ? "text-rose-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
