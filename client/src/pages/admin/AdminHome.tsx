import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../api";

type Summary = {
  weakestTopics: { name?: string; subject?: string; avgPercentage: number }[];
  strongestTopics: { name?: string; subject?: string; avgPercentage: number }[];
  classSizes: { className?: string; students: number }[];
  studentCount: number;
  activeWindowDays: number;
  studentsUsedRecentlyCount: number;
  classActivity: { className?: string; students: number; activeStudents: number }[];
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

  const weakChart =
    data?.weakestTopics.slice(0, 8).map((t) => ({
      name: (t.name ?? "?").slice(0, 14),
      v: t.avgPercentage,
    })) ?? [];

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Admin dashboard</h1>
      <p className="text-slate-600 mt-1">School-wide topic performance (aggregated).</p>
      {err && <p className="text-red-600 mt-4">{err}</p>}
      {data && (
        <>
          <p className="mt-4 text-lg">
            Students: <strong>{data.studentCount}</strong>
          </p>
          <p className="mt-1 text-lg">
            Students active in last {data.activeWindowDays} days: <strong>{data.studentsUsedRecentlyCount}</strong>
          </p>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
              <h2 className="font-semibold mb-2">Weakest topics</h2>
              <div className="h-56 min-w-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weakChart} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="v" fill="#f43f5e" name="Avg %" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
          </div>
          <div className="mt-6 rounded-xl border border-slate-200 bg-white overflow-x-auto shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">Strongest topics</th>
                  <th className="text-left p-3">Subject</th>
                  <th className="text-right p-3">Avg %</th>
                </tr>
              </thead>
              <tbody>
                {data.strongestTopics.slice(0, 10).map((t, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-3">{t.name}</td>
                    <td className="p-3">{t.subject}</td>
                    <td className="p-3 text-right">{t.avgPercentage.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
