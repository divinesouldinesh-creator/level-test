import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api } from "../../api";
import { teacherPortalNav } from "./teacherPortalNav";
import { AttendanceRangeFilters } from "../../components/AttendanceRangeFilters";
import { ClassAttendanceSummaryPanel } from "../../components/ClassAttendanceSummaryPanel";
import {
  type AttendanceRange,
  academicYearStartIso,
  buildAttendanceReportQuery,
  todayIso,
} from "../../attendanceReport";

type SectionRow = { id: string; name: string };
type ClassRow = { id: string; name: string; grade: string | null; studentCount: number; sections: SectionRow[] };
type AttendanceStatus = "PRESENT" | "ABSENT";
type AttendanceRow = {
  id: string;
  fullName: string;
  studentLoginId: string | null;
  status: AttendanceStatus;
  remark: string;
};
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
  summary: { totalDays: number; present: number; absent: number; attendancePct: number | null };
  records: { date: string; status: AttendanceStatus; remark: string; notes: string }[];
};

type AttendanceTab = "mark" | "class" | "individual";

export function TeacherAttendancePage() {
  const { logout, auth } = useAuth();
  const [tab, setTab] = useState<AttendanceTab>("mark");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportStudentId, setReportStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [reportRange, setReportRange] = useState<AttendanceRange>("last_7_days");
  const [reportDate, setReportDate] = useState(() => todayIso());
  const [reportCustomFrom, setReportCustomFrom] = useState(() => academicYearStartIso(todayIso()));
  const [reportCustomTo, setReportCustomTo] = useState(() => todayIso());
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [newStudentName, setNewStudentName] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);
  const [createdStudent, setCreatedStudent] = useState<{
    fullName: string;
    studentLoginId: string;
    password: string;
    className: string;
    sectionName: string;
  } | null>(null);
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/teacher/classes");
      if (!r.ok) {
        setError(r.error ?? "Could not load classes");
        return;
      }
      const list = r.data ?? [];
      setClasses(list);
      if (list.length > 0) {
        setClassId(list[0]!.id);
        setSectionId(list[0]!.sections[0]?.id ?? "");
      }
    })();
  }, []);

  const selectedClass = classes.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];

  useEffect(() => {
    if (sections.length === 0) {
      setSectionId("");
      return;
    }
    if (!sections.some((s) => s.id === sectionId)) {
      setSectionId(sections[0]!.id);
    }
  }, [classId, sections.length]);

  useEffect(() => {
    void (async () => {
      if (!classId || !sectionId || !date) {
        setRows([]);
        return;
      }
      setLoading(true);
      setMessage(null);
      setError(null);
      const r = await api<{ notes: string; students: AttendanceRow[] }>(
        `/api/v1/teacher/attendance?classId=${encodeURIComponent(classId)}&sectionId=${encodeURIComponent(
          sectionId
        )}&date=${encodeURIComponent(date)}`
      );
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.error ?? "Could not load attendance");
        return;
      }
      setNotes(r.data.notes ?? "");
      setRows(r.data.students ?? []);
    })();
  }, [classId, sectionId, date, attendanceRefresh]);

  useEffect(() => {
    setStudentSearch("");
  }, [classId, sectionId]);

  const filteredReportStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.studentLoginId && r.studentLoginId.toLowerCase().includes(q))
    );
  }, [rows, studentSearch]);

  useEffect(() => {
    setReportStudentId((prev) => {
      if (prev && filteredReportStudents.some((r) => r.id === prev)) return prev;
      return filteredReportStudents[0]?.id ?? "";
    });
  }, [filteredReportStudents]);

  function handleReportRangeChange(next: AttendanceRange) {
    setReportRange(next);
    if (next === "custom") {
      const today = todayIso();
      setReportCustomFrom(academicYearStartIso(today));
      setReportCustomTo(today);
    }
  }

  useEffect(() => {
    if (tab !== "individual") return;
    void (async () => {
      if (!reportStudentId) {
        setReport(null);
        return;
      }
      if (reportRange === "custom" && (!reportCustomFrom || !reportCustomTo)) return;
      setReportLoading(true);
      setReportError(null);
      const qs = buildAttendanceReportQuery({
        studentId: reportStudentId,
        range: reportRange,
        date: reportDate,
        from: reportCustomFrom,
        to: reportCustomTo,
      });
      const r = await api<AttendanceReport>(`/api/v1/teacher/attendance/report?${qs}`);
      setReportLoading(false);
      if (!r.ok || !r.data) {
        setReportError(r.error ?? "Could not load report");
        setReport(null);
        return;
      }
      setReport(r.data);
    })();
  }, [tab, reportStudentId, reportRange, reportDate, reportCustomFrom, reportCustomTo]);

  async function saveAttendance() {
    if (!classId || !sectionId || !date || rows.length === 0) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const r = await api("/api/v1/teacher/attendance", {
      method: "PUT",
      json: {
        classId,
        sectionId,
        date,
        notes,
        entries: rows.map((row) => ({
          studentId: row.id,
          status: row.status,
          remark: row.remark,
        })),
      },
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save attendance");
      return;
    }
    setMessage("Attendance saved.");
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !sectionId || !newStudentName.trim()) return;
    setAddingStudent(true);
    setError(null);
    setCreatedStudent(null);
    const r = await api<{
      fullName: string;
      studentLoginId: string;
      password: string;
      className: string;
      sectionName: string;
    }>("/api/v1/teacher/students", {
      method: "POST",
      json: {
        fullName: newStudentName.trim(),
        classId,
        sectionId,
      },
    });
    setAddingStudent(false);
    if (!r.ok || !r.data) {
      setError(r.error ?? "Could not add student");
      return;
    }
    setCreatedStudent(r.data);
    setNewStudentName("");
    setMessage(`${r.data.fullName} added. Share the login details below with the student.`);
    setAttendanceRefresh((n) => n + 1);
  }

  function startRename(row: AttendanceRow) {
    setRenamingId(row.id);
    setRenameValue(row.fullName);
    setError(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  async function saveRename(studentId: string) {
    const fullName = renameValue.trim();
    if (!fullName) {
      setError("Name cannot be empty.");
      return;
    }
    setRenameSaving(true);
    setError(null);
    const r = await api<{ fullName: string }>(`/api/v1/teacher/students/${studentId}`, {
      method: "PATCH",
      json: { fullName },
    });
    setRenameSaving(false);
    if (!r.ok) {
      setError(r.error ?? "Could not rename student");
      return;
    }
    const updated = r.data?.fullName ?? fullName;
    setRows((prev) => prev.map((row) => (row.id === studentId ? { ...row, fullName: updated } : row)));
    setRenamingId(null);
    setRenameValue("");
    setMessage(`Student renamed to “${updated}”.`);
    setAttendanceRefresh((n) => n + 1);
  }

  const classSectionSelectors = (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">
        <span className="block text-slate-600 mb-1">Class</span>
        <select className="w-full rounded-lg border px-3 py-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select class</option>
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
          disabled={!classId || sections.length === 0}
        >
          <option value="">Select section</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Teacher"}
      onLogout={logout}
      nav={[...teacherPortalNav]}
    >
      <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
      <p className="text-slate-600 mt-1">Mark the day, or check class and individual attendance reports.</p>

      <div className="mt-4 flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
        {(
          [
            ["mark", "Mark"],
            ["class", "Class"],
            ["individual", "Individual"],
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

      {tab === "mark" ? (
        <>
          <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Mark attendance</h2>
              <p className="mt-1 text-sm text-slate-600">Choose class, section and date, then save.</p>
            </div>
            {classSectionSelectors}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Date</span>
                <input
                  type="date"
                  className="w-full rounded-lg border px-3 py-2"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="w-full rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                  onClick={() => void saveAttendance()}
                  disabled={saving || !classId || !sectionId || rows.length === 0}
                >
                  {saving ? "Saving..." : "Save attendance"}
                </button>
              </div>
            </div>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
            {loading ? <p className="text-sm text-slate-500">Loading students...</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

            <form onSubmit={addStudent} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">Add a new student to this class</p>
              <p className="mt-1 text-xs text-slate-600">
                Uses the selected class and section. Login ID and password are generated automatically.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  placeholder="Student full name"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  disabled={addingStudent || !classId || !sectionId}
                />
                <button
                  type="submit"
                  disabled={addingStudent || !classId || !sectionId || !newStudentName.trim()}
                  className="rounded-lg border border-indigo-600 bg-white text-indigo-700 px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {addingStudent ? "Adding…" : "Add student"}
                </button>
              </div>
              {createdStudent ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <p className="font-medium">{createdStudent.fullName}</p>
                  <p className="mt-1">
                    Class: {createdStudent.className} · Section: {createdStudent.sectionName}
                  </p>
                  <p className="mt-1 font-mono">
                    Login: {createdStudent.studentLoginId} · Password: {createdStudent.password}
                  </p>
                </div>
              ) : null}
            </form>
          </section>

          {rows.length > 0 ? (
            <section className="mt-4 rounded-xl border bg-white shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3">Student</th>
                    <th className="text-left p-3">Login ID</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="p-3">
                        {renamingId === row.id ? (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              className="rounded border px-2 py-1 flex-1 min-w-[140px]"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              disabled={renameSaving}
                              autoFocus
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded border border-indigo-600 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 disabled:opacity-50"
                                disabled={renameSaving || !renameValue.trim()}
                                onClick={() => void saveRename(row.id)}
                              >
                                {renameSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="rounded border px-2 py-1 text-xs font-medium text-slate-600"
                                disabled={renameSaving}
                                onClick={cancelRename}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{row.fullName}</span>
                            <button
                              type="button"
                              className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                              onClick={() => startRename(row)}
                            >
                              Rename
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-3">{row.studentLoginId ?? "—"}</td>
                      <td className="p-3">
                        <select
                          className="rounded border px-2 py-1"
                          value={row.status}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, status: e.target.value as AttendanceStatus } : r
                              )
                            )
                          }
                        >
                          <option value="PRESENT">Present</option>
                          <option value="ABSENT">Absent</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <input
                          className="rounded border px-2 py-1 w-full"
                          placeholder="Optional"
                          value={row.remark ?? ""}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, remark: e.target.value } : r))
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === "class" ? (
        <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Class summary</h2>
            <p className="mt-1 text-sm text-slate-600">
              Attendance % for every student in the class and section, with filters and certificates.
            </p>
          </div>
          {classSectionSelectors}
          <ClassAttendanceSummaryPanel
            apiPrefix="/api/v1/teacher"
            classId={classId}
            sectionId={sectionId}
          />
        </section>
      ) : null}

      {tab === "individual" ? (
        <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Individual student</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose a student and date range to see present, absent, and attendance %.
            </p>
          </div>
          {classSectionSelectors}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm block">
              <span className="block text-slate-600 mb-1">Search by name</span>
              <input
                type="search"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Type student name or login ID…"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                disabled={rows.length === 0}
              />
            </label>
            <label className="text-sm block">
              <span className="block text-slate-600 mb-1">Student</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={reportStudentId}
                onChange={(e) => setReportStudentId(e.target.value)}
                disabled={filteredReportStudents.length === 0}
              >
                {filteredReportStudents.length === 0 ? (
                  <option value="">{rows.length === 0 ? "No students" : "No matches"}</option>
                ) : null}
                {filteredReportStudents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                    {r.studentLoginId ? ` (${r.studentLoginId})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {rows.length === 0 && classId && sectionId ? (
            <p className="text-sm text-slate-500">No students found for this class and section.</p>
          ) : null}
          {rows.length > 0 && filteredReportStudents.length === 0 ? (
            <p className="text-sm text-slate-500">No students match “{studentSearch.trim()}”.</p>
          ) : null}
          <AttendanceRangeFilters
            range={reportRange}
            onRangeChange={handleReportRangeChange}
            date={reportDate}
            onDateChange={setReportDate}
            customFrom={reportCustomFrom}
            onCustomFromChange={setReportCustomFrom}
            customTo={reportCustomTo}
            onCustomToChange={setReportCustomTo}
            rangeHint={report ? `${report.from} to ${report.to}` : undefined}
          />
          {reportLoading ? <p className="text-sm text-slate-500">Loading report…</p> : null}
          {reportError ? <p className="text-sm text-rose-700">{reportError}</p> : null}
          {report ? (
            <>
              <p className="text-sm text-slate-600">
                {report.student.fullName} ({report.student.studentLoginId ?? "—"}) · {report.from} to {report.to}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniCard label="Total" value={String(report.summary.totalDays)} />
                <MiniCard label="Present" value={String(report.summary.present)} />
                <MiniCard label="Absent" value={String(report.summary.absent)} />
                <MiniCard
                  label="Attendance %"
                  value={report.summary.attendancePct != null ? `${report.summary.attendancePct}%` : "—"}
                />
              </div>
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
      ) : null}
    </AppShell>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
