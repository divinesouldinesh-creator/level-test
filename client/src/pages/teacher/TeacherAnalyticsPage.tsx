import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api } from "../../api";

type ClassRow = { id: string; name: string; grade: string | null; studentCount: number };
type TopicWeak = { topicId?: string; topicName?: string; avgPercentage: number };
type StudentRow = {
  id: string;
  fullName: string;
  className: string;
  currentLevel: string;
  latestScore: number | null;
  weakTopics: string[];
  status: "RED" | "YELLOW" | "GREEN" | "NA";
};
type SearchStudent = {
  id: string;
  fullName: string;
  studentLoginId: string | null;
  className: string;
};

export function TeacherAnalyticsPage() {
  const { logout, auth } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchStudent[]>([]);
  const [weakTopics, setWeakTopics] = useState<TopicWeak[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/teacher/classes");
      if (!r.ok) {
        setErr(r.error ?? "Could not load classes");
        return;
      }
      setClasses(r.data ?? []);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const qClass = classId !== "ALL" ? `classId=${encodeURIComponent(classId)}&` : "";
      const qStatus = status !== "ALL" ? `status=${encodeURIComponent(status)}&` : "";
      const q = `?${qClass}${qStatus}subjectId=seed-subject-math`;
      const [w, s] = await Promise.all([
        api<{ weakest: TopicWeak[] }>(`/api/v1/teacher/analytics/weak-topics${q}`),
        api<StudentRow[]>(`/api/v1/teacher/analytics/students${q}`),
      ]);
      if (w.ok) setWeakTopics(w.data?.weakest ?? []);
      if (s.ok) setStudents(s.data ?? []);
    })();
  }, [classId, status]);

  useEffect(() => {
    void (async () => {
      if (classId === "ALL" || search.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      const r = await api<SearchStudent[]>(
        `/api/v1/teacher/students/search?classId=${encodeURIComponent(classId)}&q=${encodeURIComponent(search.trim())}`
      );
      setSearching(false);
      if (r.ok && r.data) setSearchResults(r.data);
      else setSearchResults([]);
    })();
  }, [classId, search]);

  const shownStudents = selectedStudentId
    ? students.filter((s) => s.id === selectedStudentId)
    : students;

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
      <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
      <p className="text-slate-600 mt-1">Simple class-level performance view.</p>
      {err ? <p className="text-red-600 mt-3">{err}</p> : null}

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        <select className="rounded-lg border px-3 py-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="ALL">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="rounded-lg border px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All status</option>
          <option value="RED">Red</option>
          <option value="YELLOW">Yellow</option>
          <option value="GREEN">Green</option>
        </select>
      </section>
      <section className="mt-3 rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">Search student by name (select class first)</p>
        <div className="mt-2 flex flex-col gap-2">
          <input
            disabled={classId === "ALL"}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedStudentId(null);
            }}
            placeholder={classId === "ALL" ? "Select class first" : "Type at least 2 letters"}
            className="rounded-lg border px-3 py-2 disabled:bg-slate-100"
          />
          {searching ? <p className="text-xs text-slate-500">Searching...</p> : null}
          {selectedStudentId ? (
            <button
              type="button"
              className="self-start text-xs text-indigo-700 underline"
              onClick={() => {
                setSelectedStudentId(null);
                setSearch("");
                setSearchResults([]);
              }}
            >
              Clear selected student
            </button>
          ) : null}
        </div>
        {searchResults.length > 0 ? (
          <ul className="mt-2 rounded-lg border border-slate-200 divide-y divide-slate-100">
            {searchResults.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-slate-50"
                  onClick={() => {
                    setSelectedStudentId(s.id);
                    setSearch(s.fullName);
                    setSearchResults([]);
                  }}
                >
                  <span className="font-medium">{s.fullName}</span>
                  <span className="text-xs text-slate-500 ml-2">{s.studentLoginId}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-5 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Weakest topics</h2>
        <ul className="mt-2 text-sm text-slate-700 space-y-1">
          {weakTopics.slice(0, 8).map((t, i) => (
            <li key={`${t.topicId ?? i}-${i}`} className="flex justify-between">
              <span>{t.topicName ?? "—"}</span>
              <span>{t.avgPercentage.toFixed(1)}%</span>
            </li>
          ))}
          {weakTopics.length === 0 ? <li className="text-slate-500">No data yet.</li> : null}
        </ul>
      </section>

      <section className="mt-5 rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">Student</th>
              <th className="text-left p-3">Class</th>
              <th className="text-left p-3">Level</th>
              <th className="text-right p-3">Latest %</th>
              <th className="text-left p-3">Weak topics</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {shownStudents.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3">{s.fullName}</td>
                <td className="p-3">{s.className}</td>
                <td className="p-3">{s.currentLevel}</td>
                <td className="p-3 text-right">{s.latestScore != null ? s.latestScore.toFixed(1) : "—"}</td>
                <td className="p-3">{s.weakTopics.length ? s.weakTopics.join(", ") : "—"}</td>
                <td className="p-3">{s.status}</td>
              </tr>
            ))}
            {shownStudents.length === 0 ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={6}>
                  No students found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
