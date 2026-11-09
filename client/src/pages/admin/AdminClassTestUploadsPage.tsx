import { useEffect, useState } from "react";
import { api } from "../../api";

type SkillSubject = { id: string; name: string };
type UploadRow = {
  id: string;
  teacherName: string;
  className: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
  kind: "MARKS" | "ORAL";
  levelName: string | null;
  testDate: string;
  savedAt: string;
};
type UploadResponse = { from: string; to: string; subjects: SkillSubject[]; rows: UploadRow[] };
type RangeKind = "today" | "7" | "30" | "custom";

function shiftDay(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AdminClassTestUploadsPage() {
  const [rangeKind, setRangeKind] = useState<RangeKind>("today");
  const [customFrom, setCustomFrom] = useState(() => shiftDay(todayIst(), -6));
  const [customTo, setCustomTo] = useState(todayIst);
  const [subjectId, setSubjectId] = useState("");
  const [data, setData] = useState<UploadResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      const today = todayIst();
      const from =
        rangeKind === "today" ? today : rangeKind === "7" ? shiftDay(today, -6) : rangeKind === "30" ? shiftDay(today, -29) : customFrom;
      const to = rangeKind === "custom" ? customTo : today;
      const q = new URLSearchParams({ from, to });
      if (subjectId) q.set("subjectIds", subjectId);
      const r = await api<UploadResponse>(`/api/v1/admin/class-test-uploads?${q.toString()}`);
      if (cancelled) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Could not load class test uploads");
        setData(null);
        return;
      }
      setData(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeKind, customFrom, customTo, subjectId]);

  const subjects = data?.subjects ?? [];
  const rows = data?.rows ?? [];

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Class test uploads</h1>
      <p className="mt-1 text-slate-600">
        Skill subjects saved in the range you pick. The time is when the teacher saved, which can differ from the test date.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">When</span>
          <select
            className="rounded-lg border px-3 py-2"
            value={rangeKind}
            onChange={(e) => setRangeKind(e.target.value as RangeKind)}
          >
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="custom">Date range</option>
          </select>
        </label>
        {rangeKind === "custom" ? (
          <>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">From</span>
              <input
                type="date"
                className="rounded-lg border px-3 py-2"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">To</span>
              <input
                type="date"
                className="rounded-lg border px-3 py-2"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </>
        ) : null}
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Subject</span>
          <select
            className="rounded-lg border px-3 py-2"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">All skill subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err ? <p className="mt-4 text-red-600">{err}</p> : null}
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : null}

      {!loading && !err && rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No skill-subject class tests saved in this range.</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3 font-medium">Saved</th>
                <th className="p-3 font-medium">Teacher</th>
                <th className="p-3 font-medium">Class</th>
                <th className="p-3 font-medium">Subject</th>
                <th className="p-3 font-medium">Test date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="p-3 whitespace-nowrap">{formatWhen(row.savedAt)}</td>
                  <td className="p-3">{row.teacherName}</td>
                  <td className="p-3">
                    {row.className} · {row.sectionName}
                  </td>
                  <td className="p-3">
                    {row.subjectName}
                    {row.levelName ? ` · ${row.levelName}` : row.kind === "ORAL" ? " · levels" : ""}
                  </td>
                  <td className="p-3 whitespace-nowrap">{formatDay(row.testDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
