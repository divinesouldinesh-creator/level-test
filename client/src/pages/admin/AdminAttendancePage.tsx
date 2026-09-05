import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { AttendanceRangeFilters } from "../../components/AttendanceRangeFilters";
import { ClassAttendanceSummaryPanel } from "../../components/ClassAttendanceSummaryPanel";
import {
  type AttendanceRange,
  type AttendanceReportSummary,
  academicYearStartIso,
  buildAttendanceReportQuery,
  todayIso,
} from "../../attendanceReport";

type Section = { id: string; name: string };
type ClassRow = { id: string; name: string; sections: Section[] };
type Student = { id: string; fullName: string; studentLoginId: string | null };
type AttendanceStatus = "PRESENT" | "ABSENT";
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
  summary: AttendanceReportSummary;
  records: { date: string; status: AttendanceStatus; remark: string; notes: string }[];
};

type AttendanceTab = "individual" | "class";

export function AdminAttendancePage() {
  const [tab, setTab] = useState<AttendanceTab>("individual");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [range, setRange] = useState<AttendanceRange>("last_7_days");
  const [date, setDate] = useState(() => todayIso());
  const [customFrom, setCustomFrom] = useState(() => academicYearStartIso(todayIso()));
  const [customTo, setCustomTo] = useState(() => todayIso());
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      setStudentSearch("");
      setStudentId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? ""));
    })();
  }, [classId, sectionId]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        (s.studentLoginId && s.studentLoginId.toLowerCase().includes(q))
    );
  }, [students, studentSearch]);

  useEffect(() => {
    setStudentId((prev) => {
      if (prev && filteredStudents.some((s) => s.id === prev)) return prev;
      return filteredStudents[0]?.id ?? "";
    });
  }, [filteredStudents]);

  useEffect(() => {
    if (tab !== "individual") return;
    void (async () => {
      if (!studentId) {
        setReport(null);
        return;
      }
      if (range === "custom" && (!customFrom || !customTo)) return;
      setLoading(true);
      setErr(null);
      const qs = buildAttendanceReportQuery({
        studentId,
        range,
        date,
        from: customFrom,
        to: customTo,
      });
      const r = await api<AttendanceReport>(`/api/v1/admin/attendance/report?${qs}`);
      setLoading(false);
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Could not load attendance report");
        setReport(null);
        return;
      }
      setReport(r.data);
    })();
  }, [tab, studentId, range, date, customFrom, customTo]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
      <p className="text-slate-600 mt-1">
        Check one student&apos;s attendance, or see the whole class summary and certificates.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
        {(
          [
            ["individual", "Individual"],
            ["class", "Class"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[140px] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
              tab === id
                ? "bg-white text-brand-900 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "individual" ? (
        <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Individual student</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose a student and date range to see present, absent, and attendance %.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Class</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Section</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Search by name</span>
              <input
                type="search"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Type student name or login ID…"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                disabled={students.length === 0}
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Student</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={filteredStudents.length === 0}
              >
                {filteredStudents.length === 0 ? (
                  <option value="">{students.length === 0 ? "No students" : "No matches"}</option>
                ) : null}
                {filteredStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                    {s.studentLoginId ? ` (${s.studentLoginId})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {students.length > 0 && filteredStudents.length === 0 ? (
            <p className="text-sm text-slate-500">No students match “{studentSearch.trim()}”.</p>
          ) : null}
          <AttendanceRangeFilters
            range={range}
            onRangeChange={handleRangeChange}
            date={date}
            onDateChange={setDate}
            customFrom={customFrom}
            onCustomFromChange={setCustomFrom}
            customTo={customTo}
            onCustomToChange={setCustomTo}
            rangeHint={report ? `${report.from} to ${report.to}` : undefined}
          />

          {loading ? <p className="text-slate-500">Loading report…</p> : null}
          {err ? <p className="text-rose-700">{err}</p> : null}

          {report ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card label="Total" value={String(report.summary.totalDays)} />
                <Card label="Present" value={String(report.summary.present)} />
                <Card label="Absent" value={String(report.summary.absent)} />
                <Card
                  label="Attendance %"
                  value={report.summary.attendancePct != null ? `${report.summary.attendancePct}%` : "—"}
                />
              </div>
              <p className="text-sm text-slate-600">
                {report.student.fullName} ({report.student.studentLoginId ?? "—"}) · {report.student.className} ·{" "}
                {report.student.sectionName} · {report.from} to {report.to}
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
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
                        <td className="p-3 whitespace-nowrap">{r.date}</td>
                        <td className="p-3">
                          <span
                            className={
                              r.status === "PRESENT"
                                ? "text-emerald-700 font-medium"
                                : "text-rose-700 font-medium"
                            }
                          >
                            {r.status === "PRESENT" ? "Present" : "Absent"}
                          </span>
                        </td>
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
              </div>
            </>
          ) : null}
        </section>
      ) : (
        <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Class summary</h2>
            <p className="mt-1 text-sm text-slate-600">
              Attendance % for every student in a class and section, with filters and certificates.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Class</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Section</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ClassAttendanceSummaryPanel
            apiPrefix="/api/v1/admin"
            classId={classId}
            sectionId={sectionId}
          />
        </section>
      )}
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
