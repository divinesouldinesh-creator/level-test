import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { AttendanceRangeFilters } from "../AttendanceRangeFilters";
import {
  type AttendanceRange,
  type SchoolAttendanceOverview,
  type SchoolSectionPctFilter,
  academicYearStartIso,
  buildAttendanceOverviewQuery,
  filterSchoolOverviewRows,
  todayIso,
} from "../../attendanceReport";

export type SchoolOverviewOpenClass = {
  classId: string;
  sectionId: string;
  range: AttendanceRange;
  date: string;
  customFrom: string;
  customTo: string;
};

type Props = {
  onOpenClass: (selection: SchoolOverviewOpenClass) => void;
};

export function SchoolAttendanceOverviewPanel({ onOpenClass }: Props) {
  const [range, setRange] = useState<AttendanceRange>("last_7_days");
  const [date, setDate] = useState(() => todayIso());
  const [customFrom, setCustomFrom] = useState(() => academicYearStartIso(todayIso()));
  const [customTo, setCustomTo] = useState(() => todayIso());
  const [overview, setOverview] = useState<SchoolAttendanceOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pctFilter, setPctFilter] = useState<SchoolSectionPctFilter>("all");

  function handleRangeChange(next: AttendanceRange) {
    setRange(next);
    if (next === "custom") {
      const today = todayIso();
      setCustomFrom(academicYearStartIso(today));
      setCustomTo(today);
    }
  }

  useEffect(() => {
    if (range === "custom" && (!customFrom || !customTo)) return;
    void (async () => {
      setLoading(true);
      setErr(null);
      const qs = buildAttendanceOverviewQuery({
        range,
        date,
        from: customFrom,
        to: customTo,
      });
      const r = await api<SchoolAttendanceOverview>(`/api/v1/admin/attendance/overview?${qs}`);
      setLoading(false);
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Could not load school attendance");
        setOverview(null);
        return;
      }
      setOverview(r.data);
    })();
  }, [range, date, customFrom, customTo]);

  const filtered = useMemo(() => {
    if (!overview) return [];
    return filterSchoolOverviewRows(overview.sections, pctFilter);
  }, [overview, pctFilter]);

  return (
    <div className="space-y-3">
      <AttendanceRangeFilters
        range={range}
        onRangeChange={handleRangeChange}
        date={date}
        onDateChange={setDate}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        rangeHint={overview ? `${overview.from} to ${overview.to}` : undefined}
      />

      {loading ? <p className="text-sm text-slate-500">Loading school attendance…</p> : null}
      {err ? <p className="text-sm text-rose-700">{err}</p> : null}

      {overview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat
              label="School attendance"
              value={
                overview.school.attendancePct != null ? `${overview.school.attendancePct}%` : "—"
              }
              tone={pctTone(overview.school.attendancePct)}
            />
            <Stat label="Present marks" value={String(overview.school.present)} />
            <Stat label="Absent marks" value={String(overview.school.absent)} />
            <Stat
              label="Students below 75%"
              value={String(overview.school.studentsBelow75)}
              tone={overview.school.studentsBelow75 > 0 ? "warn" : "ok"}
            />
            <Stat
              label="Sections below 75%"
              value={`${overview.school.sectionsBelow75} / ${overview.sections.length}`}
              tone={overview.school.sectionsBelow75 > 0 ? "warn" : "ok"}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Class filter</span>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 min-w-[200px]"
                value={pctFilter}
                onChange={(e) => setPctFilter(e.target.value as SchoolSectionPctFilter)}
              >
                <option value="all">All class sections</option>
                <option value="below_75">Below 75%</option>
                <option value="no_records">No records in range</option>
              </select>
            </label>
            <p className="text-sm text-slate-600 pb-2">
              Showing {filtered.length} of {overview.sections.length} sections ·{" "}
              {overview.school.studentCount} students
            </p>
          </div>

          <p className="text-xs text-slate-500">
            Sorted lowest attendance first. Open a row to see every student in that class.
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">Class</th>
                  <th className="text-left p-3">Section</th>
                  <th className="text-right p-3">Students</th>
                  <th className="text-right p-3">Present</th>
                  <th className="text-right p-3">Absent</th>
                  <th className="text-right p-3">Below 75%</th>
                  <th className="text-left p-3 min-w-[160px]">Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const low = row.attendancePct != null && row.attendancePct < 75;
                  return (
                    <tr
                      key={`${row.classId}-${row.sectionId}`}
                      className={`border-t border-slate-100 cursor-pointer hover:bg-indigo-50 ${
                        low ? "bg-rose-50/70" : ""
                      }`}
                      tabIndex={0}
                      onClick={() =>
                        onOpenClass({ classId: row.classId, sectionId: row.sectionId, range, date, customFrom, customTo })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenClass({
                            classId: row.classId,
                            sectionId: row.sectionId,
                            range,
                            date,
                            customFrom,
                            customTo,
                          });
                        }
                      }}
                    >
                      <td className="p-3 font-medium text-slate-900">{row.className}</td>
                      <td className="p-3 text-slate-700">{row.sectionName}</td>
                      <td className="p-3 text-right">{row.studentCount}</td>
                      <td className="p-3 text-right">{row.present}</td>
                      <td className="p-3 text-right">{row.absent}</td>
                      <td className="p-3 text-right">
                        {row.studentsBelow75 > 0 ? (
                          <span className="font-medium text-rose-700">{row.studentsBelow75}</span>
                        ) : (
                          row.studentsBelow75
                        )}
                      </td>
                      <td className="p-3">
                        <PctBar pct={row.attendancePct} />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-500">
                      No class sections match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function pctTone(pct: number | null): "ok" | "warn" | undefined {
  if (pct == null) return undefined;
  return pct < 75 ? "warn" : "ok";
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
    tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-rose-700" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-base font-semibold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}

function PctBar({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-slate-500">—</span>;
  }
  const bar =
    pct < 75 ? "bg-rose-500" : pct < 90 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className={`w-12 text-right font-medium ${pct < 75 ? "text-rose-700" : "text-slate-900"}`}>
        {pct}%
      </span>
    </div>
  );
}
