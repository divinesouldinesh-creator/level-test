import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { AttendanceRangeFilters } from "./AttendanceRangeFilters";
import {
  type AttendancePctFilterPreset,
  type AttendanceRange,
  type ClassAttendanceSummary,
  type CustomPctCompare,
  academicYearStartIso,
  buildAttendanceSummaryQuery,
  filterAttendanceSummaryRows,
  formatMonthLabel,
  todayIso,
  yearMonthFromIso,
} from "../attendanceReport";
import { openAttendanceCertificatesPrint } from "./attendance/attendanceCertificates";
import {
  certificateMediaUrl,
  fetchSchoolBranding,
  type SchoolBranding,
} from "../schoolBranding";

type Props = {
  apiPrefix: "/api/v1/teacher" | "/api/v1/admin";
  classId: string;
  sectionId: string;
};

export function ClassAttendanceSummaryPanel({ apiPrefix, classId, sectionId }: Props) {
  const [range, setRange] = useState<AttendanceRange>("last_7_days");
  const [date, setDate] = useState(() => todayIso());
  const [customFrom, setCustomFrom] = useState(() => academicYearStartIso(todayIso()));
  const [customTo, setCustomTo] = useState(() => todayIso());
  const [summary, setSummary] = useState<ClassAttendanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pctFilter, setPctFilter] = useState<AttendancePctFilterPreset>("all");
  const [customPct, setCustomPct] = useState(75);
  const [customCompare, setCustomCompare] = useState<CustomPctCompare>("below");
  const [certMonth, setCertMonth] = useState(() => yearMonthFromIso(todayIso()));
  const [certMsg, setCertMsg] = useState<string | null>(null);
  const [schoolBranding, setSchoolBranding] = useState<SchoolBranding | null>(null);

  function handleRangeChange(next: AttendanceRange) {
    setRange(next);
    if (next === "custom") {
      const today = todayIso();
      setCustomFrom(academicYearStartIso(today));
      setCustomTo(today);
    }
  }

  useEffect(() => {
    void (async () => {
      const branding = await fetchSchoolBranding();
      setSchoolBranding(branding);
    })();
  }, []);

  useEffect(() => {
    if (!classId || !sectionId) {
      setSummary(null);
      return;
    }
    if (range === "custom" && (!customFrom || !customTo)) return;
    void (async () => {
      setLoading(true);
      setErr(null);
      const qs = buildAttendanceSummaryQuery({
        classId,
        sectionId,
        range,
        date,
        from: customFrom,
        to: customTo,
      });
      const r = await api<ClassAttendanceSummary>(`${apiPrefix}/attendance/summary?${qs}`);
      setLoading(false);
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Could not load class summary");
        setSummary(null);
        return;
      }
      setSummary(r.data);
    })();
  }, [apiPrefix, classId, sectionId, range, date, customFrom, customTo]);

  useEffect(() => {
    setCertMonth(yearMonthFromIso(date));
  }, [date]);

  const filtered = useMemo(() => {
    if (!summary) return [];
    return filterAttendanceSummaryRows(summary.students, pctFilter, customPct, customCompare);
  }, [summary, pctFilter, customPct, customCompare]);

  function printCertificates() {
    setCertMsg(null);
    if (!summary) {
      setCertMsg("Attendance summary is still loading. Please wait and try again.");
      return;
    }
    if (filtered.length === 0) {
      setCertMsg("No students match the current filter. Try “All students” or a different range.");
      return;
    }
    const monthLabel = formatMonthLabel(certMonth || yearMonthFromIso(date));
    const result = openAttendanceCertificatesPrint(
      filtered.map((s) => ({
        studentName: s.fullName,
        className: summary.className,
        sectionName: summary.sectionName,
        monthLabel,
      })),
      {
        documentTitle: `Attendance certificates — ${summary.className} — ${monthLabel}`,
        schoolName: schoolBranding?.schoolName,
        logoUrl: certificateMediaUrl(schoolBranding?.logoUrl),
      }
    );
    if (result === "empty") {
      setCertMsg("No students to print.");
    } else if (result === "downloaded") {
      setCertMsg(
        "Pop-up was blocked, so certificates were downloaded as an HTML file. Open that file in your browser, then use Print → Save as PDF."
      );
    } else {
      setCertMsg(
        `Opened ${filtered.length} certificate${filtered.length === 1 ? "" : "s"} in a new tab. Use the yellow “Print / Save as PDF” button if the print dialog did not appear.`
      );
    }
  }

  if (!classId || !sectionId) {
    return (
      <p className="text-sm text-slate-500">Select a class and section to see the attendance summary.</p>
    );
  }

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
        rangeHint={summary ? `${summary.from} to ${summary.to}` : undefined}
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Attendance filter</span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 min-w-[200px]"
            value={pctFilter}
            onChange={(e) => setPctFilter(e.target.value as AttendancePctFilterPreset)}
          >
            <option value="all">All students</option>
            <option value="below_75">Below 75%</option>
            <option value="gte_75">75% and above</option>
            <option value="perfect">100% (perfect)</option>
            <option value="no_records">No records in range</option>
            <option value="custom">Custom threshold…</option>
          </select>
        </label>
        {pctFilter === "custom" ? (
          <>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Compare</span>
              <select
                className="rounded-lg border border-slate-300 px-3 py-2"
                value={customCompare}
                onChange={(e) => setCustomCompare(e.target.value as CustomPctCompare)}
              >
                <option value="below">Below</option>
                <option value="gte">At or above</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Percentage</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2"
                value={customPct}
                onChange={(e) => setCustomPct(Number(e.target.value))}
              />
            </label>
          </>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading class summary…</p> : null}
      {err ? <p className="text-sm text-rose-700">{err}</p> : null}

      {summary ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-slate-600">
              {summary.className} · Section {summary.sectionName} · Showing {filtered.length} of{" "}
              {summary.students.length} students
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Certificate month</span>
                <input
                  type="month"
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={certMonth}
                  onChange={(e) => setCertMonth(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
                disabled={filtered.length === 0}
                onClick={printCertificates}
              >
                Print certificates ({filtered.length})
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Generates a colorful certificate per filtered student (name, class, month). A new tab opens — use
            Print → Save as PDF to download. Allow pop-ups if nothing appears. Tip: filter to 100% for perfect-attendance
            awards.
          </p>
          {certMsg ? (
            <p className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
              {certMsg}
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">Student</th>
                  <th className="text-left p-3">Login ID</th>
                  <th className="text-right p-3">Present</th>
                  <th className="text-right p-3">Absent</th>
                  <th className="text-right p-3">Total days</th>
                  <th className="text-right p-3">Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="p-3 font-medium text-slate-900">{s.fullName}</td>
                    <td className="p-3 text-slate-600">{s.studentLoginId ?? "—"}</td>
                    <td className="p-3 text-right">{s.present}</td>
                    <td className="p-3 text-right">{s.absent}</td>
                    <td className="p-3 text-right">{s.totalDays}</td>
                    <td className="p-3 text-right font-medium">
                      {s.attendancePct != null ? `${s.attendancePct}%` : "—"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500">
                      No students match this filter.
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
