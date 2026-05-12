import { useEffect, useState } from "react";
import { api } from "../../api";

type Section = { id: string; name: string };
type ClassRow = { id: string; name: string; sections: Section[] };
type Student = { id: string; fullName: string; studentLoginId: string | null };
type AttendanceRange = "daily" | "weekly" | "monthly";
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";
type AttendanceReport = {
  student: {
    id: string;
    fullName: string;
    studentLoginId: string | null;
    className: string;
    sectionName: string;
  };
  from: string;
  to: string;
  summary: { totalDays: number; present: number; absent: number; late: number; leave: number; attendancePct: number | null };
  records: { date: string; status: AttendanceStatus; remark: string; notes: string }[];
};

export function AdminAttendancePage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [range, setRange] = useState<AttendanceRange>("weekly");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/admin/classes");
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Could not load classes");
        return;
      }
      setClasses(r.data);
      const firstClass = r.data[0];
      if (firstClass) {
        setClassId(firstClass.id);
        setSectionId(firstClass.sections[0]?.id ?? "");
      }
    })();
  }, []);

  const sections = classes.find((c) => c.id === classId)?.sections ?? [];

  useEffect(() => {
    if (!sections.some((s) => s.id === sectionId)) {
      setSectionId(sections[0]?.id ?? "");
    }
  }, [sections, sectionId]);

  useEffect(() => {
    void (async () => {
      if (!classId || !sectionId) {
        setStudents([]);
        setStudentId("");
        return;
      }
      const r = await api<{ students: { id: string; fullName: string; username: string }[] }>(
        `/api/v1/admin/students?classId=${encodeURIComponent(classId)}&sectionId=${encodeURIComponent(sectionId)}`
      );
      if (!r.ok || !r.data) {
        setStudents([]);
        setStudentId("");
        return;
      }
      const list = (r.data.students ?? []).map((s) => ({
        id: s.id,
        fullName: s.fullName,
        studentLoginId: s.username,
      }));
      setStudents(list);
      setStudentId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? ""));
    })();
  }, [classId, sectionId]);

  useEffect(() => {
    void (async () => {
      if (!studentId) {
        setReport(null);
        return;
      }
      setLoading(true);
      setErr(null);
      const r = await api<AttendanceReport>(
        `/api/v1/admin/attendance/report?studentId=${encodeURIComponent(studentId)}&range=${encodeURIComponent(
          range
        )}&date=${encodeURIComponent(date)}`
      );
      setLoading(false);
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Could not load attendance report");
        setReport(null);
        return;
      }
      setReport(r.data);
    })();
  }, [studentId, range, date]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Attendance reports</h1>
      <p className="text-slate-600 mt-1">Daily, weekly, and monthly attendance for any student in any class.</p>

      <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <select className="rounded-lg border px-3 py-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="rounded-lg border px-3 py-2" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="rounded-lg border px-3 py-2" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
          <select className="rounded-lg border px-3 py-2" value={range} onChange={(e) => setRange(e.target.value as AttendanceRange)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input type="date" className="rounded-lg border px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </section>

      {loading ? <p className="mt-4 text-slate-500">Loading report…</p> : null}
      {err ? <p className="mt-4 text-rose-700">{err}</p> : null}

      {report ? (
        <>
          <section className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card label="Total" value={String(report.summary.totalDays)} />
            <Card label="Present" value={String(report.summary.present)} />
            <Card label="Late" value={String(report.summary.late)} />
            <Card label="Absent" value={String(report.summary.absent)} />
            <Card label="Leave" value={String(report.summary.leave)} />
            <Card label="Attendance %" value={report.summary.attendancePct != null ? `${report.summary.attendancePct}%` : "—"} />
          </section>
          <p className="mt-3 text-sm text-slate-600">
            {report.student.fullName} ({report.student.studentLoginId ?? "—"}) • {report.student.className} •{" "}
            {report.student.sectionName} • {report.from} to {report.to}
          </p>
        </>
      ) : null}
    </div>
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
