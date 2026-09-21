import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { todayIso } from "../../attendanceReport";

type MarkingRow = {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  marked: boolean;
  markedBy: string | null;
  markedAt: string | null;
  entryCount: number;
};

type MarkingStatus = {
  date: string;
  isHoliday?: boolean;
  holidayName?: string | null;
  totalSections: number;
  markedCount: number;
  unmarkedCount: number;
  rows: MarkingRow[];
};

type Filter = "all" | "unmarked" | "marked";

function formatMarkedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AttendanceMarkingStatusPanel() {
  const [date, setDate] = useState(() => todayIso());
  const [filter, setFilter] = useState<Filter>("unmarked");
  const [data, setData] = useState<MarkingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setData(null);
      return;
    }
    void (async () => {
      setLoading(true);
      setErr(null);
      const r = await api<MarkingStatus>(
        `/api/v1/admin/attendance/marking-status?date=${encodeURIComponent(date)}`
      );
      setLoading(false);
      if (!r.ok || !r.data) {
        setData(null);
        setErr(r.error ?? "Could not load marking status");
        return;
      }
      setData(r.data);
    })();
  }, [date]);

  useEffect(() => {
    if (data?.isHoliday) setFilter("all");
  }, [data?.date, data?.isHoliday]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (filter === "unmarked") return data.rows.filter((r) => !r.marked);
    if (filter === "marked") return data.rows.filter((r) => r.marked);
    return data.rows;
  }, [data, filter]);

  return (
    <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Marking status</h2>
        <p className="mt-1 text-sm text-slate-600">
          See which class sections have attendance for the day, and who marked them.
        </p>
      </div>

      {data?.isHoliday ? (
        <p className="text-sm text-violet-900 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          {data.date} is a holiday{data.holidayName ? ` (${data.holidayName})` : ""}. Marking is
          optional — teachers are not expected to take attendance.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Date</span>
          <input
            type="date"
            className="rounded-lg border px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["unmarked", "Not marked"],
              ["marked", "Marked"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium min-h-[40px] border ${
                filter === id
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Sections" value={String(data.totalSections)} />
          <Stat label="Marked" value={String(data.markedCount)} tone="ok" />
          <Stat label="Not marked" value={String(data.unmarkedCount)} tone="warn" />
        </div>
      ) : null}

      {loading ? <p className="text-slate-500">Loading…</p> : null}
      {err ? <p className="text-rose-700">{err}</p> : null}

      {!loading && data ? (
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">Class</th>
                <th className="text-left p-3">Section</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Marked by</th>
                <th className="text-left p-3">Updated</th>
                <th className="text-right p-3">Entries</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.classId}-${r.sectionId}`} className="border-t border-slate-100">
                  <td className="p-3">{r.className}</td>
                  <td className="p-3">{r.sectionName}</td>
                  <td className="p-3">
                    {r.marked ? (
                      <span className="font-medium text-emerald-700">Marked</span>
                    ) : (
                      <span className="font-medium text-amber-800">Not marked</span>
                    )}
                  </td>
                  <td className="p-3">{r.markedBy ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">{formatMarkedAt(r.markedAt)}</td>
                  <td className="p-3 text-right">{r.marked ? r.entryCount : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={6}>
                    {filter === "unmarked"
                      ? "All sections are marked for this day."
                      : filter === "marked"
                        ? "No sections marked yet for this day."
                        : "No class sections found."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const valueClass =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-800"
        : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}
