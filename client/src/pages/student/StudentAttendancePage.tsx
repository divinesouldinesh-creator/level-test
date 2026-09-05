import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { AttendanceRangeFilters } from "../../components/AttendanceRangeFilters";
import { api } from "../../api";
import { useAuth } from "../../auth";
import {
  type AttendanceRange,
  type AttendanceStreak,
  academicYearStartIso,
  attendanceStreakMessage,
  buildAttendanceReportQuery,
  formatMonthLabel,
  todayIso,
} from "../../attendanceReport";
import { openAttendanceCertificatesPrint } from "../../components/attendance/attendanceCertificates";
import { certificateMediaUrl, fetchSchoolBranding, type SchoolBranding } from "../../schoolBranding";
import { studentNav } from "../../studentNav";

type AttendanceStatus = "PRESENT" | "ABSENT";
type AttendanceReport = {
  student: {
    id: string;
    fullName: string;
    studentLoginId: string | null;
    classId: string;
    className: string;
    sectionId: string;
    sectionName: string;
  };
  range: AttendanceRange;
  from: string;
  to: string;
  summary: {
    totalDays: number;
    present: number;
    absent: number;
    attendancePct: number | null;
  };
  streak: AttendanceStreak;
  records: { date: string; status: AttendanceStatus; remark: string; notes: string }[];
};

/** Previous calendar month as YYYY-MM (UTC date parts from ISO day). */
function previousCalendarMonthYm(asOfIso = todayIso()): string {
  const [y, m] = asOfIso.slice(0, 7).split("-").map(Number);
  const prev = new Date(Date.UTC(y, (m ?? 1) - 2, 1));
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, "0");
  return `${py}-${pm}`;
}

type StudentAttendanceTab = "attendance" | "certificate";

export function StudentAttendancePage() {
  const { logout, auth } = useAuth();
  const [tab, setTab] = useState<StudentAttendanceTab>("attendance");
  const [range, setRange] = useState<AttendanceRange>("weekly");
  const [date, setDate] = useState(() => todayIso());
  const [customFrom, setCustomFrom] = useState(() => academicYearStartIso(todayIso()));
  const [customTo, setCustomTo] = useState(() => todayIso());
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const certMonth = previousCalendarMonthYm();
  const [monthReport, setMonthReport] = useState<AttendanceReport | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [certMsg, setCertMsg] = useState<string | null>(null);
  const [schoolBranding, setSchoolBranding] = useState<SchoolBranding | null>(null);
  const headerTitle = [auth.profile?.fullName, auth.profile?.className].filter(Boolean).join(" - ") || "Student";

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
    if (range === "custom" && (!customFrom || !customTo)) return;
    void (async () => {
      setLoading(true);
      setErr(null);
      const qs = buildAttendanceReportQuery({
        range,
        date,
        from: customFrom,
        to: customTo,
      });
      const r = await api<AttendanceReport>(`/api/v1/student/attendance/report?${qs}`);
      setLoading(false);
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Could not load attendance");
        return;
      }
      setReport(r.data);
    })();
  }, [range, date, customFrom, customTo]);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(certMonth)) {
      setMonthReport(null);
      return;
    }
    void (async () => {
      setMonthLoading(true);
      setCertMsg(null);
      const anchor = `${certMonth}-01`;
      const qs = buildAttendanceReportQuery({ range: "monthly", date: anchor });
      const r = await api<AttendanceReport>(`/api/v1/student/attendance/report?${qs}`);
      setMonthLoading(false);
      if (!r.ok || !r.data) {
        setMonthReport(null);
        return;
      }
      setMonthReport(r.data);
    })();
  }, [certMonth]);

  const monthPerfect =
    !!monthReport &&
    monthReport.summary.totalDays > 0 &&
    monthReport.summary.absent === 0 &&
    (monthReport.summary.attendancePct === 100 ||
      monthReport.summary.present === monthReport.summary.totalDays);

  function downloadCertificate() {
    setCertMsg(null);
    if (!monthReport) {
      setCertMsg("Still loading last month’s attendance. Try again in a moment.");
      return;
    }
    if (!monthPerfect) {
      setCertMsg(
        `Certificate for ${formatMonthLabel(certMonth)} unlocks only with 100% attendance for that full month.`
      );
      return;
    }
    const monthLabel = formatMonthLabel(certMonth);
    const result = openAttendanceCertificatesPrint(
      [
        {
          studentName: monthReport.student.fullName,
          className: monthReport.student.className,
          sectionName: monthReport.student.sectionName,
          monthLabel,
        },
      ],
      {
        documentTitle: `Attendance certificate — ${monthReport.student.fullName} — ${monthLabel}`,
        schoolName: schoolBranding?.schoolName,
        logoUrl: certificateMediaUrl(schoolBranding?.logoUrl),
      }
    );
    if (result === "empty") {
      setCertMsg("Could not create certificate.");
    } else if (result === "downloaded") {
      setCertMsg(
        "Pop-up was blocked, so the certificate was downloaded as an HTML file. Open it, then use Print → Save as PDF."
      );
    } else {
      setCertMsg(
        "Certificate opened in a new tab. Use Print → Save as PDF if the print dialog did not appear."
      );
    }
  }

  return (
    <AppShell
      title={headerTitle}
      onLogout={logout}
      nav={[...studentNav]}
      sidebarKicker="Student"
    >
      <h1 className="text-2xl font-bold text-slate-900">My attendance</h1>

      {loading && !report ? <p className="mt-4 text-slate-500">Loading attendance…</p> : null}
      {err && !report ? <p className="mt-4 text-rose-700">{err}</p> : null}

      {report ? (
        <section className="mt-4 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 text-3xl shadow-md">
              🔥
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Attendance streak
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                {report.streak.currentStreak}{" "}
                <span className="text-lg font-semibold text-slate-600">
                  {report.streak.currentStreak === 1 ? "day" : "days"}
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-700">{attendanceStreakMessage(report.streak)}</p>
              <p className="mt-2 text-xs text-slate-500">
                Best this year: <strong>{report.streak.bestStreak}</strong> day
                {report.streak.bestStreak === 1 ? "" : "s"}
                {report.streak.asOfDate ? ` · Last marked: ${report.streak.asOfDate}` : ""}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
        {(
          [
            ["attendance", "Attendance"],
            ["certificate", "Certificate"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[100px] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
              tab === id
                ? "bg-white text-brand-900 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "attendance" ? (
        <>
          <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
            <AttendanceRangeFilters
              range={range}
              onRangeChange={handleRangeChange}
              date={date}
              onDateChange={setDate}
              customFrom={customFrom}
              onCustomFromChange={setCustomFrom}
              customTo={customTo}
              onCustomToChange={setCustomTo}
              rangeHint={report ? `${report.from} to ${report.to}` : "Select range and dates"}
            />
          </section>

          {loading ? <p className="mt-4 text-slate-500">Loading attendance…</p> : null}
          {err ? <p className="mt-4 text-rose-700">{err}</p> : null}

          {report ? (
            <>
              <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card label="Total" value={String(report.summary.totalDays)} />
                <Card label="Present" value={String(report.summary.present)} />
                <Card label="Absent" value={String(report.summary.absent)} />
                <Card
                  label="Attendance %"
                  value={report.summary.attendancePct != null ? `${report.summary.attendancePct}%` : "—"}
                />
              </section>

              <section className="mt-4 rounded-xl border bg-white shadow-sm overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Remark</th>
                      <th className="text-left p-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.records.map((r) => (
                      <tr key={`${r.date}-${r.status}-${r.remark}`} className="border-t border-slate-100">
                        <td className="p-3">{r.date}</td>
                        <td className="p-3">{r.status}</td>
                        <td className="p-3">{r.remark || "—"}</td>
                        <td className="p-3">{r.notes || "—"}</td>
                      </tr>
                    ))}
                    {report.records.length === 0 ? (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={4}>
                          No attendance records in this range.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            </>
          ) : null}
        </>
      ) : (
        <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Attendance certificate</h2>
            <p className="mt-1 text-sm text-slate-600">
              Available for <strong>last month only</strong> ({formatMonthLabel(certMonth)}), and only if you had{" "}
              <strong>100% attendance</strong> for that full month. The current month cannot be downloaded yet.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="text-sm">
              <span className="block text-slate-600 mb-1">Certificate month</span>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-900">
                {formatMonthLabel(certMonth)}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
              disabled={monthLoading || !monthPerfect}
              onClick={downloadCertificate}
            >
              {monthLoading ? "Checking…" : "Download certificate"}
            </button>
          </div>
          {!monthLoading && monthReport ? (
            <p className="text-sm text-slate-600">
              {formatMonthLabel(certMonth)}: {monthReport.summary.present} present ·{" "}
              {monthReport.summary.absent} absent ·{" "}
              {monthReport.summary.attendancePct != null
                ? `${monthReport.summary.attendancePct}%`
                : "—"}
              {monthPerfect
                ? " · Perfect — certificate ready."
                : monthReport.summary.totalDays === 0
                  ? " · No attendance was marked last month."
                  : " · Not eligible (need 100% for the full month)."}
            </p>
          ) : null}
          {certMsg ? (
            <p
              className={`text-sm rounded-lg px-3 py-2 border ${
                monthPerfect
                  ? "text-indigo-800 bg-indigo-50 border-indigo-200"
                  : "text-amber-900 bg-amber-50 border-amber-200"
              }`}
            >
              {certMsg}
            </p>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
