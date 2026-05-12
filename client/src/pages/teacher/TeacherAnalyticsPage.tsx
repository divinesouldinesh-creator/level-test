import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api } from "../../api";
import { teacherPortalNav } from "./teacherPortalNav";

type ClassRow = { id: string; name: string; grade: string | null; studentCount: number };
type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  levels: { id: string; name: string; order: number }[];
};
type TopicWeak = { topicId?: string; topicName?: string; subjectName?: string; avgPercentage: number };
type StudentRow = {
  id: string;
  fullName: string;
  className: string;
  currentLevel: string;
  latestScore: number | null;
  weakTopics: string[];
  status: "RED" | "YELLOW" | "GREEN" | "NA";
  lastCompletedTestAt: string | null;
};
type SearchStudent = {
  id: string;
  fullName: string;
  studentLoginId: string | null;
  className: string;
};

type StudentDetail = {
  student: { id: string; fullName: string; studentLoginId: string | null; className: string };
  tests: { testId: string; level: string; percentage: number | null; completedAt: string | null }[];
  lastTestAttempt: string | null;
};

function formatTestDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TeacherAnalyticsPage() {
  const { logout, auth } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [classId, setClassId] = useState("ALL");
  const [subjectId, setSubjectId] = useState<string>("");
  const [levelId, setLevelId] = useState("ALL");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchStudent[]>([]);
  const [weakTopics, setWeakTopics] = useState<TopicWeak[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [detailStudent, setDetailStudent] = useState<StudentDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const historyPanelRef = useRef<HTMLElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [c, subj] = await Promise.all([
        api<ClassRow[]>("/api/v1/teacher/classes"),
        api<SubjectRow[]>("/api/v1/teacher/subjects"),
      ]);
      if (!c.ok) setErr(c.error ?? "Could not load classes");
      else setClasses(c.data ?? []);
      if (!subj.ok) setErr(subj.error ?? "Could not load subjects");
      else {
        const list = subj.data ?? [];
        setSubjects(list);
        setSubjectId((prev) => {
          if (prev && list.some((s) => s.id === prev)) return prev;
          return list[0]?.id ?? "";
        });
      }
    })();
  }, []);

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    const list = !q
      ? subjects
      : subjects.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.code && s.code.toLowerCase().includes(q))
        );
    if (subjectId && !list.some((s) => s.id === subjectId)) {
      const cur = subjects.find((s) => s.id === subjectId);
      if (cur) return [cur, ...list];
    }
    return list;
  }, [subjects, subjectSearch, subjectId]);

  const levelsForSubject = useMemo(() => {
    const s = subjects.find((x) => x.id === subjectId);
    return s?.levels ?? [];
  }, [subjects, subjectId]);

  useEffect(() => {
    setLevelId((prev) => {
      if (prev === "ALL") return "ALL";
      return levelsForSubject.some((l) => l.id === prev) ? prev : "ALL";
    });
  }, [subjectId, levelsForSubject]);

  useEffect(() => {
    void (async () => {
      if (!subjectId) {
        setWeakTopics([]);
        setStudents([]);
        return;
      }
      const qClass = classId !== "ALL" ? `classId=${encodeURIComponent(classId)}&` : "";
      const qStatus = status !== "ALL" ? `status=${encodeURIComponent(status)}&` : "";
      const qLevel = levelId !== "ALL" ? `levelId=${encodeURIComponent(levelId)}&` : "";
      const q = `?${qClass}${qLevel}${qStatus}subjectId=${encodeURIComponent(subjectId)}`;
      const [w, s] = await Promise.all([
        api<{ weakest: TopicWeak[] }>(`/api/v1/teacher/analytics/weak-topics${q}`),
        api<StudentRow[]>(`/api/v1/teacher/analytics/students${q}`),
      ]);
      if (w.ok) setWeakTopics(w.data?.weakest ?? []);
      if (s.ok) setStudents(s.data ?? []);
    })();
  }, [classId, status, subjectId, levelId]);

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

  useEffect(() => {
    setDetailStudent(null);
    setDetailError(null);
    setDetailLoadingId(null);
  }, [subjectId, levelId]);

  useEffect(() => {
    if (!detailStudent) return;
    requestAnimationFrame(() => {
      historyPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [detailStudent]);

  async function openStudentDetail(studentId: string) {
    if (!subjectId) return;
    setDetailStudent(null);
    setDetailError(null);
    setDetailLoadingId(studentId);
    try {
      const r = await api<StudentDetail>(
        `/api/v1/teacher/analytics/student/${encodeURIComponent(studentId)}/detail?subjectId=${encodeURIComponent(subjectId)}`
      );
      if (r.ok && r.data) {
        setDetailStudent(r.data);
      } else {
        setDetailError(r.error ?? "Could not load test history.");
      }
    } catch {
      setDetailError("Could not reach the server. Check that the API is running and try again.");
    } finally {
      setDetailLoadingId(null);
    }
  }

  const shownStudents = selectedStudentId
    ? students.filter((s) => s.id === selectedStudentId)
    : students;

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Teacher"}
      onLogout={logout}
      sidebarKicker="Skill tests"
      nav={[...teacherPortalNav]}
    >
      <h1 className="text-2xl font-bold text-slate-900">Skill tests</h1>
      <p className="text-slate-600 mt-1">
        Filter by class, subject, and level. See each student&apos;s last completed test for the current filters.
      </p>
      {err ? <p className="text-red-600 mt-3">{err}</p> : null}

      <section className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <select className="rounded-lg border px-3 py-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="ALL">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Search subject</label>
          <input
            value={subjectSearch}
            onChange={(e) => setSubjectSearch(e.target.value)}
            placeholder="Filter subject list…"
            className="rounded-lg border px-3 py-2 text-sm"
            disabled={subjects.length === 0}
          />
        </div>
        <select
          className="rounded-lg border px-3 py-2"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setLevelId("ALL");
          }}
          disabled={filteredSubjects.length === 0}
        >
          {filteredSubjects.length === 0 ? (
            <option value="">No subjects</option>
          ) : (
            filteredSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.code ? ` (${s.code})` : ""}
              </option>
            ))
          )}
        </select>
        <select
          className="rounded-lg border px-3 py-2"
          value={levelId}
          onChange={(e) => setLevelId(e.target.value)}
          disabled={!subjectId || levelsForSubject.length === 0}
        >
          <option value="ALL">All levels</option>
          {levelsForSubject.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-3 grid gap-3 md:grid-cols-2">
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
        <p className="text-xs text-slate-500 mt-1">Scoped to the subject and level filters above.</p>
        <ul className="mt-2 text-sm text-slate-700 space-y-1">
          {weakTopics.slice(0, 8).map((t, i) => (
            <li key={`${t.topicId ?? i}-${i}`} className="flex justify-between gap-2">
              <span>
                {t.topicName ?? "—"}
                {t.subjectName ? <span className="text-slate-500"> · {t.subjectName}</span> : null}
              </span>
              <span className="shrink-0">{t.avgPercentage.toFixed(1)}%</span>
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
              <th className="text-left p-3">Last test</th>
              <th className="text-left p-3">Weak topics</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3 w-28">Detail</th>
            </tr>
          </thead>
          <tbody>
            {shownStudents.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3">{s.fullName}</td>
                <td className="p-3">{s.className}</td>
                <td className="p-3">{s.currentLevel}</td>
                <td className="p-3 text-right">{s.latestScore != null ? s.latestScore.toFixed(1) : "—"}</td>
                <td className="p-3 whitespace-nowrap">{formatTestDate(s.lastCompletedTestAt)}</td>
                <td className="p-3">{s.weakTopics.length ? s.weakTopics.join(", ") : "—"}</td>
                <td className="p-3">{s.status}</td>
                <td className="p-3">
                  <button
                    type="button"
                    className="text-indigo-700 underline text-left disabled:opacity-50"
                    disabled={!subjectId || detailLoadingId !== null}
                    onClick={() => void openStudentDetail(s.id)}
                  >
                    {detailLoadingId === s.id ? "Loading…" : "View history"}
                  </button>
                </td>
              </tr>
            ))}
            {shownStudents.length === 0 ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={8}>
                  {subjectId ? "No students found." : "Select a subject to load analytics."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {detailLoadingId ? (
        <p className="mt-4 text-sm text-slate-600" aria-live="polite">
          Loading test history…
        </p>
      ) : null}
      {detailError ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {detailError}
        </p>
      ) : null}

      {detailStudent ? (
        <section ref={historyPanelRef} className="mt-5 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">Test history: {detailStudent.student.fullName}</h2>
              <p className="text-sm text-slate-600 mt-1">
                {detailStudent.student.studentLoginId ?? "—"} · {detailStudent.student.className}
              </p>
              <p className="text-sm mt-2">
                <span className="font-medium text-slate-800">Last completed test: </span>
                {formatTestDate(detailStudent.lastTestAttempt)}
              </p>
            </div>
            <button
              type="button"
              className="text-sm text-slate-600 underline"
              onClick={() => {
                setDetailStudent(null);
                setDetailError(null);
              }}
            >
              Close
            </button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2">Level</th>
                  <th className="text-right p-2">Score %</th>
                  <th className="text-left p-2">Completed</th>
                </tr>
              </thead>
              <tbody>
                {detailStudent.tests.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-3 text-slate-500">
                      No completed tests for this subject yet.
                    </td>
                  </tr>
                ) : (
                  detailStudent.tests.map((t) => (
                    <tr key={t.testId} className="border-t border-slate-100">
                      <td className="p-2">{t.level}</td>
                      <td className="p-2 text-right">{t.percentage != null ? t.percentage.toFixed(1) : "—"}</td>
                      <td className="p-2 whitespace-nowrap">{formatTestDate(t.completedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
