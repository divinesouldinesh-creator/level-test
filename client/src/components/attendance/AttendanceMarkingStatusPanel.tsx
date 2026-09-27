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

type DayStatus = {
  mode: "day";
  date: string;
  isHoliday?: boolean;
  holidayName?: string | null;
  rows: MarkingRow[];
};

type MonthRow = {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  markedDayCount: number;
  missingDates: string[];
};

type MonthStatus = {
  mode: "month";
  month: string;
  from: string;
  to: string | null;
  schoolDayCount: number;
  holidayCount: number;
  rows: MonthRow[];
};

type MarkingView = DayStatus | MonthStatus;

type ClassOption = { id: string; name: string };
type Scope = "day" | "month";
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

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

function formatMonthRange(from: string, to: string | null): string {
  if (!to) return "This month has not started yet.";
  if (from === to) return formatDayLabel(from);
  return `${formatDayLabel(from)} – ${formatDayLabel(to)}`;
}

export function AttendanceMarkingStatusPanel() {
  const [scope, setScope] = useState<Scope>("month");
  const [date, setDate] = useState(() => todayIso());
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [filter, setFilter] = useState<Filter>("unmarked");
  const [data, setData] = useState<MarkingView | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassOption[]>("/api/v1/admin/classes");
      if (!r.ok || !r.data) return;
      const list = [...r.data].sort((a, b) => a.name.localeCompare(b.name));
      setClasses(list.map((c) => ({ id: c.id, name: c.name })));
    })();
  }, []);

  useEffect(() => {
    if (scope === "day" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setData(null);
      return;
    }
    if (scope === "month" && !/^\d{4}-\d{2}$/.test(month)) {
      setData(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      if (scope === "day") {
        const r = await api<Omit<DayStatus, "mode">>(`/api/v1/admin/attendance/marking-status?date=${encodeURIComponent(date)}`);
        if (cancelled) return;
        setLoading(false);
        if (!r.ok || !r.data) {
          setData(null);
          setErr(r.error ?? "Could not load marking status");
          return;
        }
        setData({ mode: "day", ...r.data });
        return;
      }
      const r = await api<Omit<MonthStatus, "mode">>(
        `/api/v1/admin/attendance/marking-status?month=${encodeURIComponent(month)}`
      );
      if (cancelled) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setData(null);
        setErr(r.error ?? "Could not load marking status");
        return;
      }
      setData({ mode: "month", ...r.data });
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, date, month]);

  useEffect(() => {
    if (data?.mode === "day" && data.isHoliday) setFilter("all");
  }, [data]);

  const dayRows = data?.mode === "day" ? data.rows : [];
  const monthRows = data?.mode === "month" ? data.rows : [];

  const scopedDayRows = useMemo(
    () => (classId ? dayRows.filter((r) => r.classId === classId) : dayRows),
    [dayRows, classId]
  );
  const scopedMonthRows = useMemo(
    () => (classId ? monthRows.filter((r) => r.classId === classId) : monthRows),
    [monthRows, classId]
  );

  const visibleDayRows = useMemo(() => {
    if (filter === "unmarked") return scopedDayRows.filter((r) => !r.marked);
    if (filter === "marked") return scopedDayRows.filter((r) => r.marked);
    return scopedDayRows;
  }, [scopedDayRows, filter]);

  const visibleMonthRows = useMemo(() => {
    if (filter === "unmarked") return scopedMonthRows.filter((r) => r.missingDates.length > 0);
    if (filter === "marked") return scopedMonthRows.filter((r) => r.missingDates.length === 0 && (data?.mode === "month" ? data.schoolDayCount > 0 : true));
    return scopedMonthRows;
  }, [scopedMonthRows, filter, data]);

  const fullyMarkedCount = scopedMonthRows.filter((r) => r.missingDates.length === 0 && data?.mode === "month" && data.schoolDayCount > 0).length;
  const missingSectionCount = scopedMonthRows.filter((r) => r.missingDates.length > 0).length;

  function openDay(iso: string) {
    setDate(iso);
    setScope("day");
    setFilter("all");
  }

  return (
    <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Marking status</h2>
        <p className="mt-1 text-sm text-slate-600">
          See which class sections have attendance for a day, or which school days are still open across a month.
          Holidays are not counted as missing.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["month", "Month"],
              ["day", "Day"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium min-h-[40px] border ${
                scope === id
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Class</span>
          <select
            className="rounded-lg border px-3 py-2 min-h-[40px] bg-white"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {scope === "month" ? (
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Month</span>
            <input
              type="month"
              className="rounded-lg border px-3 py-2 min-h-[40px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        ) : (
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Date</span>
            <input
              type="date"
              className="rounded-lg border px-3 py-2 min-h-[40px]"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        )}
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

      {data?.mode === "day" && data.isHoliday ? (
        <p className="text-sm text-violet-900 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          {data.date} is a holiday{data.holidayName ? ` (${data.holidayName})` : ""}. Teachers cannot
          mark attendance on this day.
        </p>
      ) : null}

      {data?.mode === "month" ? (
        <p className="text-sm text-slate-600">
          {data.schoolDayCount === 0
            ? "No school days are due in this month yet."
            : `${data.schoolDayCount} school day${data.schoolDayCount === 1 ? "" : "s"} from ${formatMonthRange(data.from, data.to)}.`}
          {data.holidayCount > 0
            ? ` ${data.holidayCount} holiday${data.holidayCount === 1 ? "" : "s"} excluded.`
            : ""}
        </p>
      ) : null}

      {data?.mode === "day" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Sections" value={String(scopedDayRows.length)} />
          <Stat label="Marked" value={String(scopedDayRows.filter((r) => r.marked).length)} tone="ok" />
          <Stat label="Not marked" value={String(scopedDayRows.filter((r) => !r.marked).length)} tone="warn" />
        </div>
      ) : data?.mode === "month" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="School days" value={String(data.schoolDayCount)} />
          <Stat label="Fully marked" value={String(fullyMarkedCount)} tone="ok" />
          <Stat label="Missing a day" value={String(missingSectionCount)} tone="warn" />
        </div>
      ) : null}

      {loading ? <p className="text-slate-500">Loading…</p> : null}
      {err ? <p className="text-rose-700">{err}</p> : null}

      {!loading && data?.mode === "day" ? (
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
              {visibleDayRows.map((r) => (
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
              {visibleDayRows.length === 0 ? (
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

      {!loading && data?.mode === "month" ? (
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">Class</th>
                <th className="text-left p-3">Section</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Days</th>
                <th className="text-left p-3">Missing dates</th>
              </tr>
            </thead>
            <tbody>
              {visibleMonthRows.map((r) => {
                const complete = r.missingDates.length === 0 && data.schoolDayCount > 0;
                return (
                  <tr key={`${r.classId}-${r.sectionId}`} className="border-t border-slate-100">
                    <td className="p-3">{r.className}</td>
                    <td className="p-3">{r.sectionName}</td>
                    <td className="p-3">
                      {data.schoolDayCount === 0 ? (
                        <span className="text-slate-500">No school days</span>
                      ) : complete ? (
                        <span className="font-medium text-emerald-700">Marked</span>
                      ) : (
                        <span className="font-medium text-amber-800">
                          {r.missingDates.length} missing
                        </span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {r.markedDayCount} / {data.schoolDayCount}
                    </td>
                    <td className="p-3">
                      {r.missingDates.length === 0 ? (
                        "—"
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {r.missingDates.map((iso) => (
                            <button
                              key={iso}
                              type="button"
                              onClick={() => openDay(iso)}
                              className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900 hover:bg-amber-100"
                            >
                              {formatDayLabel(iso)}
                            </button>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleMonthRows.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={5}>
                    {data.schoolDayCount === 0
                      ? "No school days are due in this month yet."
                      : filter === "unmarked"
                        ? "All sections are marked for this month."
                        : filter === "marked"
                          ? "No sections are fully marked for this month."
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
