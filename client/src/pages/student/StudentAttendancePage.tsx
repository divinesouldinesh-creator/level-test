import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { api } from "../../api";
import { useAuth } from "../../auth";

type AttendanceRange = "daily" | "weekly" | "monthly";
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";
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
    late: number;
    leave: number;
    attendancePct: number | null;
  };
  records: { date: string; status: AttendanceStatus; remark: string; notes: string }[];
};

export function StudentAttendancePage() {
  const { logout, auth } = useAuth();
  const [range, setRange] = useState<AttendanceRange>("weekly");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const headerTitle = [auth.profile?.fullName, auth.profile?.className].filter(Boolean).join(" - ") || "Student";

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      const r = await api<AttendanceReport>(
        `/api/v1/student/attendance/report?range=${encodeURIComponent(range)}&date=${encodeURIComponent(date)}`
      );
      setLoading(false);
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Could not load attendance");
        return;
      }
      setReport(r.data);
    })();
  }, [range, date]);

  return (
    <AppShell
      title={headerTitle}
      onLogout={logout}
      nav={[
        { to: "/student", label: "Skill subjects" },
        { to: "/student/syllabus", label: "Syllabus" },
        { to: "/student/attendance", label: "Attendance" },
      ]}
    >
      <h1 className="text-2xl font-bold text-slate-900">My attendance</h1>
      <p className="mt-1 text-slate-600">Check daily, weekly, or monthly attendance from your login.</p>

      <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="rounded-lg border px-3 py-2"
            value={range}
            onChange={(e) => setRange(e.target.value as AttendanceRange)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input
            type="date"
            className="rounded-lg border px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="text-sm text-slate-500 flex items-center">
            {report ? `${report.from} to ${report.to}` : "Select range and date"}
          </p>
        </div>
      </section>

      {loading ? <p className="mt-4 text-slate-500">Loading attendance…</p> : null}
      {err ? <p className="mt-4 text-rose-700">{err}</p> : null}

      {report ? (
        <>
          <section className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card label="Total" value={String(report.summary.totalDays)} />
            <Card label="Present" value={String(report.summary.present)} />
            <Card label="Late" value={String(report.summary.late)} />
            <Card label="Absent" value={String(report.summary.absent)} />
            <Card label="Leave" value={String(report.summary.leave)} />
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
