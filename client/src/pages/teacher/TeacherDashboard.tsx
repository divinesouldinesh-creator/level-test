import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";

type ClassRow = { id: string; name: string; grade: string | null; studentCount: number };
type StudentRow = {
  id: string;
  studentLoginId: string | null;
  fullName: string;
  className: string;
  currentLevel: string;
  latestScore: number | null;
  weakTopics: string[];
  strongTopics: string[];
  status: "RED" | "YELLOW" | "GREEN" | "NA";
  suggestedAction: string;
};
type StudentDetail = {
  student: { id: string; fullName: string; studentLoginId: string | null; className: string };
  levelProgress: { subject: string; level: string; score: number | null; unlocked: boolean; lastAttemptAt: string | null }[];
  weakTopics: { topicName: string; percentage: number }[];
  strongTopics: { topicName: string; percentage: number }[];
  daysSinceLastActivity: number | null;
  alerts: { noTestIn14Days: boolean; noProgressIn30Days: boolean };
};
type TopicWeak = {
  topicId?: string;
  topicName?: string;
  subjectName?: string;
  avgPercentage: number;
};
type SearchStudent = {
  id: string;
  fullName: string;
  studentLoginId: string | null;
  className: string;
};

export function TeacherDashboard() {
  const { logout, auth } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [weak, setWeak] = useState<TopicWeak[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classId, setClassId] = useState<string>("ALL");
  const [levelId, setLevelId] = useState<string>("ALL");
  const [subjectId, setSubjectId] = useState<string>("seed-subject-math");
  const [status, setStatus] = useState<string>("ALL");
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<{ name: string; students: { studentName: string; percentage: number }[] } | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchStudent[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const studentDetailRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void (async () => {
      const [c] = await Promise.all([
        api<ClassRow[]>("/api/v1/teacher/classes"),
      ]);
      if (!c.ok) setErr(c.error ?? "Failed classes");
      else {
        const loaded = c.data ?? [];
        setClasses(loaded);
        if (classId === "ALL" && loaded.length) {
          const withStudents = loaded
            .filter((x) => x.studentCount > 0)
            .sort((a, b) => b.studentCount - a.studentCount);
          const preferred = withStudents[0] ?? loaded[0];
          setClassId(preferred.id);
        }
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const qClass = classId !== "ALL" ? `classId=${encodeURIComponent(classId)}&` : "";
      const qLevel = levelId !== "ALL" ? `levelId=${encodeURIComponent(levelId)}&` : "";
      const qStatus = status !== "ALL" ? `status=${encodeURIComponent(status)}&` : "";
      const query = `?${qClass}${qLevel}${qStatus}subjectId=${encodeURIComponent(subjectId)}`;
      const [w, s] = await Promise.all([
        api<{ weakest: TopicWeak[] }>(`/api/v1/teacher/analytics/weak-topics${query}`),
        api<StudentRow[]>(`/api/v1/teacher/analytics/students${query}`),
      ]);
      if (w.ok && w.data?.weakest) setWeak(w.data.weakest);
      if (s.ok && s.data) setStudents(s.data);
    })();
  }, [classId, levelId, status, subjectId]);

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

  const redCount = students.filter((s) => s.status === "RED").length;
  const yellowCount = students.filter((s) => s.status === "YELLOW").length;
  const greenCount = students.filter((s) => s.status === "GREEN").length;

  async function openStudent(studentId: string) {
    const r = await api<StudentDetail>(`/api/v1/teacher/analytics/student/${studentId}/detail?subjectId=${subjectId}`);
    if (r.ok && r.data) {
      setSelectedStudent(r.data);
      setSearchResults([]);
      setSearch("");
      setTimeout(() => {
        studentDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } else {
      setErr(r.error ?? "Could not open student detail");
    }
  }

  async function openTopic(topicId: string, topicName?: string) {
    const q = classId !== "ALL" ? `?classId=${encodeURIComponent(classId)}` : "";
    const r = await api<{ students: { studentName: string; percentage: number }[] }>(
      `/api/v1/teacher/analytics/topic/${topicId}/weak-students${q}`
    );
    if (r.ok && r.data) {
      setSelectedTopic({ name: topicName ?? "Topic", students: r.data.students });
    }
  }

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Teacher"}
      onLogout={logout}
      nav={[{ to: "/teacher", label: "Overview" }]}
    >
      <h1 className="text-2xl font-bold text-slate-900">Teacher dashboard</h1>
      {err && <p className="text-red-600 mt-2">{err}</p>}
      <section className="mt-4 grid gap-3 md:grid-cols-4">
        <select className="rounded-lg border px-3 py-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="ALL">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="rounded-lg border px-3 py-2" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          <option value="ALL">All Levels</option>
          <option value="seed-level-0">Level 0</option>
          <option value="seed-level-1">Level 1</option>
          <option value="seed-level-2">Level 2</option>
        </select>
        <select className="rounded-lg border px-3 py-2" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="seed-subject-math">Basic Mathematics</option>
        </select>
        <select className="rounded-lg border px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All Status</option>
          <option value="RED">Red</option>
          <option value="YELLOW">Yellow</option>
          <option value="GREEN">Green</option>
        </select>
      </section>
      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card title="Total Students" value={String(students.length)} />
        <Card title="Red Zone" value={String(redCount)} />
        <Card title="Yellow Zone" value={String(yellowCount)} />
        <Card title="Green Zone" value={String(greenCount)} />
        <Card title="Most Difficult Topic" value={weak[0]?.topicName ?? "—"} />
      </section>
      <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-lg">Analyze single student</h2>
        <p className="text-sm text-slate-600 mt-1">Select class first, then search by student name.</p>
        <div className="mt-3 flex flex-col md:flex-row gap-3 md:items-center">
          <input
            disabled={classId === "ALL"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={classId === "ALL" ? "Select class first" : "Type student name..."}
            className="rounded-lg border px-3 py-2 w-full md:w-96 disabled:bg-slate-100"
          />
          {searching && <span className="text-sm text-slate-500">Searching...</span>}
        </div>
        {searchResults.length > 0 && (
          <ul className="mt-3 rounded-lg border border-slate-200 divide-y divide-slate-100 max-w-xl">
            {searchResults.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => void openStudent(s.id)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50"
                >
                  <span className="font-medium">{s.fullName}</span>
                  <span className="text-xs text-slate-500 ml-2">{s.studentLoginId}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selectedStudent && (
        <section ref={studentDetailRef} className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-lg">Student detail: {selectedStudent.student.fullName}</h2>
          <p className="text-sm text-slate-600 mt-1">
            {selectedStudent.student.studentLoginId} • {selectedStudent.student.className}
          </p>
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            <div>
              <p className="font-medium">Weak topics</p>
              <p className="text-sm mt-1">{selectedStudent.weakTopics.length ? selectedStudent.weakTopics.map((w) => `${w.topicName} (${w.percentage}%)`).join(", ") : "—"}</p>
            </div>
            <div>
              <p className="font-medium">Strong topics</p>
              <p className="text-sm mt-1">{selectedStudent.strongTopics.length ? selectedStudent.strongTopics.map((w) => `${w.topicName} (${w.percentage}%)`).join(", ") : "—"}</p>
            </div>
          </div>
          <div className="mt-4 text-sm">
            <p>Days since last activity: {selectedStudent.daysSinceLastActivity ?? "No attempts yet"}</p>
            {selectedStudent.alerts.noTestIn14Days && <p className="text-rose-700">Alert: No test attempt in last 14 days</p>}
            {selectedStudent.alerts.noProgressIn30Days && <p className="text-rose-700">Alert: No level progress in last 30 days</p>}
          </div>
        </section>
      )}
      <section className="mt-6">
        <h2 className="font-semibold text-lg">Classes</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {classes.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="font-semibold">{c.name}</p>
              {c.grade && <p className="text-sm text-slate-500">Grade {c.grade}</p>}
              <p className="text-sm mt-2">{c.studentCount} students</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-semibold text-lg">Topic weakness</h2>
        <div className="mt-3 rounded-xl border overflow-x-auto bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">Topic</th>
                <th className="text-left p-3">Subject</th>
                <th className="text-right p-3">Avg %</th>
              </tr>
            </thead>
            <tbody>
              {weak.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => r.topicId && void openTopic(r.topicId, r.topicName)}>
                  <td className="p-3">{r.topicName ?? "—"}</td>
                  <td className="p-3">{r.subjectName}</td>
                  <td className="p-3 text-right">{r.avgPercentage.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-semibold text-lg">Student weakness table</h2>
        <div className="mt-3 rounded-xl border overflow-x-auto bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">Student</th>
                <th className="text-left p-3">Class</th>
                <th className="text-left p-3">Current Level</th>
                <th className="text-right p-3">Latest %</th>
                <th className="text-left p-3">Weak Topics</th>
                <th className="text-left p-3">Strong Topics</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Suggested Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => void openStudent(s.id)}>
                  <td className="p-3">{s.fullName}</td>
                  <td className="p-3">{s.className}</td>
                  <td className="p-3">{s.currentLevel}</td>
                  <td className="p-3 text-right">{s.latestScore != null ? s.latestScore.toFixed(1) : "—"}</td>
                  <td className="p-3">{s.weakTopics.length ? s.weakTopics.join(", ") : "—"}</td>
                  <td className="p-3">{s.strongTopics.length ? s.strongTopics.join(", ") : "—"}</td>
                  <td className="p-3">{s.status}</td>
                  <td className="p-3">{s.suggestedAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selectedTopic && (
        <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-lg">Topic detail: {selectedTopic.name}</h2>
          <p className="text-sm text-slate-600 mt-1">Students weak in this topic</p>
          <ul className="mt-3 space-y-1 text-sm">
            {selectedTopic.students.length === 0 ? <li>No weak students found.</li> : selectedTopic.students.map((s, i) => <li key={i}>{s.studentName} - {s.percentage}%</li>)}
          </ul>
        </section>
      )}
    </AppShell>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
