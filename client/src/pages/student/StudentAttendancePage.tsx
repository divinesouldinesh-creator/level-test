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
  todayIso,
} from "../../attendanceReport";
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

export function StudentAttendancePage() {
  const { logout, auth } = useAuth();
  const [range, setRange] = useState<AttendanceRange>("weekly");
  const [date, setDate] = useState(() => todayIso());
  const [customFrom, setCustomFrom] = useState(() => academicYearStartIso(todayIso()));
  const [customTo, setCustomTo] = useState(() => todayIso());
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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

  return (
    <AppShell
      title={headerTitle}
      onLogout={logout}
      nav={[...studentNav]}
      sidebarKicker="Student"
    >
      <h1 className="text-2xl font-bold text-slate-900">My attendance</h1>
      <p className="mt-1 text-slate-600">
        View daily, weekly, monthly, academic-year, or custom-range attendance.
      </p>

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
