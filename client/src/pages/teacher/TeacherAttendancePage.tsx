import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api } from "../../api";

type SectionRow = { id: string; name: string };
type ClassRow = { id: string; name: string; grade: string | null; studentCount: number; sections: SectionRow[] };
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";
type AttendanceRow = {
  id: string;
  fullName: string;
  studentLoginId: string | null;
  status: AttendanceStatus;
  remark: string;
};

export function TeacherAttendancePage() {
  const { logout, auth } = useAuth();
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
  }, [classId, sectionId, date]);

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

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Teacher"}
      onLogout={logout}
      nav={[
        { to: "/teacher", label: "Overview", end: true },
        { to: "/teacher/attendance", label: "Attendance" },
        { to: "/teacher/analytics", label: "Analytics" },
      ]}
    >
      <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
      <p className="text-slate-600 mt-1">Mark attendance quickly by class, section and date.</p>

      <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <select className="rounded-lg border px-3 py-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border px-3 py-2"
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
          <input type="date" className="rounded-lg border px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
          <button
            type="button"
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            onClick={() => void saveAttendance()}
            disabled={saving || !classId || !sectionId || rows.length === 0}
          >
            {saving ? "Saving..." : "Save attendance"}
          </button>
        </div>
        <textarea
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
        />
        {loading ? <p className="mt-3 text-sm text-slate-500">Loading students...</p> : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
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
                  <td className="p-3">{row.fullName}</td>
                  <td className="p-3">{row.studentLoginId ?? "—"}</td>
                  <td className="p-3">
                    <select
                      className="rounded border px-2 py-1"
                      value={row.status}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, status: e.target.value as AttendanceStatus } : r))
                        )
                      }
                    >
                      <option value="PRESENT">Present</option>
                      <option value="ABSENT">Absent</option>
                      <option value="LATE">Late</option>
                      <option value="LEAVE">Leave</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      className="rounded border px-2 py-1 w-full"
                      placeholder="Optional"
                      value={row.remark ?? ""}
                      onChange={(e) =>
                        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, remark: e.target.value } : r)))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </AppShell>
  );
}
