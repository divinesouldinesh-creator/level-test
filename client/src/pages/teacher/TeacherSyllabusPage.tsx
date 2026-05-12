import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api } from "../../api";
import { teacherPortalNav } from "./teacherPortalNav";

type ClassRow = { id: string; name: string; grade: string | null; studentCount: number };
type SyllabusSubjectRow = { id: string; name: string; code: string | null };
type SyllabusStudentRow = {
  id: string;
  fullName: string;
  studentLoginId: string | null;
  className: string;
  hasCompletedTest: boolean;
  hasInProgressTest: boolean;
  lastCompletedTestAt: string | null;
};

type SyllabusStudentDetail = {
  student: { id: string; fullName: string; studentLoginId: string | null; className: string };
  syllabusSubject: { id: string; name: string; code: string | null };
  lastCompletedTestAt: string | null;
  tests: {
    testId: string;
    completedAt: string | null;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    difficulty: string | null;
    questionCount: number;
    chapters: string | null;
  }[];
};

function formatDt(iso: string | null | undefined): string {
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

function activityLabel(s: SyllabusStudentRow): string {
  if (s.hasInProgressTest) return "In progress";
  if (s.hasCompletedTest) return "Completed";
  return "Not started";
}

export function TeacherSyllabusPage() {
  const { logout, auth } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [subjects, setSubjects] = useState<SyllabusSubjectRow[]>([]);
  const [syllabusSubjectId, setSyllabusSubjectId] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [students, setStudents] = useState<SyllabusStudentRow[]>([]);
  const [detail, setDetail] = useState<SyllabusStudentDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const historyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/teacher/classes");
      if (!r.ok) {
        setErr(r.error ?? "Could not load classes");
        return;
      }
      const list = r.data ?? [];
      setErr(null);
      setClasses(list);
      setClassId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0]?.id ?? ""));
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      if (!classId) {
        setSubjects([]);
        setSyllabusSubjectId("");
        setStudents([]);
        return;
      }
      const r = await api<SyllabusSubjectRow[]>(
        `/api/v1/teacher/syllabus/subjects?classId=${encodeURIComponent(classId)}`
      );
      if (!r.ok) {
        setSubjects([]);
        setSyllabusSubjectId("");
        setErr(r.error ?? "Could not load syllabus subjects");
        return;
      }
      const list = r.data ?? [];
      setErr(null);
      setSubjects(list);
      setSyllabusSubjectId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? ""));
    })();
  }, [classId]);

  useEffect(() => {
    void (async () => {
      if (!classId || !syllabusSubjectId) {
        setStudents([]);
        return;
      }
      const r = await api<SyllabusStudentRow[]>(
        `/api/v1/teacher/syllabus/students?classId=${encodeURIComponent(classId)}&syllabusSubjectId=${encodeURIComponent(syllabusSubjectId)}`
      );
      if (r.ok && r.data) {
        setErr(null);
        setStudents(r.data);
      } else {
        setStudents([]);
        if (!r.ok) setErr(r.error ?? "Could not load students");
      }
    })();
  }, [classId, syllabusSubjectId]);

  useEffect(() => {
    setDetail(null);
    setDetailError(null);
  }, [classId, syllabusSubjectId]);

  useEffect(() => {
    if (!detail) return;
    requestAnimationFrame(() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [detail]);

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    const list = !q
      ? subjects
      : subjects.filter((s) => s.name.toLowerCase().includes(q) || (s.code && s.code.toLowerCase().includes(q)));
    if (syllabusSubjectId && !list.some((s) => s.id === syllabusSubjectId)) {
      const cur = subjects.find((s) => s.id === syllabusSubjectId);
      if (cur) return [cur, ...list];
    }
    return list;
  }, [subjects, subjectSearch, syllabusSubjectId]);

  async function openDetail(studentId: string) {
    if (!syllabusSubjectId) return;
    setDetail(null);
    setDetailError(null);
    setDetailLoadingId(studentId);
    try {
      const r = await api<SyllabusStudentDetail>(
        `/api/v1/teacher/syllabus/student/${encodeURIComponent(studentId)}/detail?syllabusSubjectId=${encodeURIComponent(syllabusSubjectId)}`
      );
      if (r.ok && r.data) setDetail(r.data);
      else setDetailError(r.error ?? "Could not load history.");
    } catch {
      setDetailError("Could not reach the server. Check that the API is running.");
    } finally {
      setDetailLoadingId(null);
    }
  }

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Teacher"}
      onLogout={logout}
      sidebarKicker="Syllabus tests"
      nav={[...teacherPortalNav]}
    >
      <h1 className="text-2xl font-bold text-slate-900">Syllabus tests</h1>
      <p className="text-slate-600 mt-1">
        See whether students have started syllabus practice tests and view completed test marks by class and subject.
      </p>
      {err ? <p className="text-red-600 mt-3">{err}</p> : null}

      <section className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <select className="rounded-lg border px-3 py-2" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex flex-col gap-1 lg:col-span-2">
          <label className="text-xs font-medium text-slate-500">Search syllabus subject</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
              placeholder="Filter by name or code…"
              className="rounded-lg border px-3 py-2 text-sm flex-1 disabled:bg-slate-100"
              disabled={subjects.length === 0 || !classId}
            />
            <select
              className="rounded-lg border px-3 py-2 sm:min-w-[200px]"
              value={syllabusSubjectId}
              onChange={(e) => setSyllabusSubjectId(e.target.value)}
              disabled={filteredSubjects.length === 0 || !classId}
            >
              {filteredSubjects.length === 0 ? (
                <option value="">{classId ? "No syllabus subjects" : "Choose a class"}</option>
              ) : (
                filteredSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.code ? ` (${s.code})` : ""}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">Student</th>
              <th className="text-left p-3">Login ID</th>
              <th className="text-left p-3">Activity</th>
              <th className="text-left p-3">Last completed</th>
              <th className="text-left p-3 w-36">History</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3">{s.fullName}</td>
                <td className="p-3">{s.studentLoginId ?? "—"}</td>
                <td className="p-3">{activityLabel(s)}</td>
                <td className="p-3 whitespace-nowrap">{formatDt(s.lastCompletedTestAt)}</td>
                <td className="p-3">
                  <button
                    type="button"
                    className="text-indigo-700 underline disabled:opacity-50"
                    disabled={!syllabusSubjectId || detailLoadingId !== null}
                    onClick={() => void openDetail(s.id)}
                  >
                    {detailLoadingId === s.id ? "Loading…" : "View history"}
                  </button>
                </td>
              </tr>
            ))}
            {students.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-3 text-slate-500">
                  {!classId
                    ? "Select a class."
                    : !syllabusSubjectId
                      ? "Select a syllabus subject."
                      : "No students in this class."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {detailLoadingId ? (
        <p className="mt-4 text-sm text-slate-600" aria-live="polite">
          Loading marks…
        </p>
      ) : null}
      {detailError ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {detailError}
        </p>
      ) : null}

      {detail ? (
        <section ref={historyRef} className="mt-5 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">
                Marks: {detail.student.fullName} · {detail.syllabusSubject.name}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {detail.student.studentLoginId ?? "—"} · {detail.student.className}
              </p>
              <p className="text-sm mt-2">
                <span className="font-medium text-slate-800">Last completed test: </span>
                {formatDt(detail.lastCompletedTestAt)}
              </p>
            </div>
            <button
              type="button"
              className="text-sm text-slate-600 underline"
              onClick={() => {
                setDetail(null);
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
                  <th className="text-left p-2">When</th>
                  <th className="text-right p-2">Score</th>
                  <th className="text-right p-2">%</th>
                  <th className="text-left p-2">Chapters</th>
                  <th className="text-left p-2">Info</th>
                </tr>
              </thead>
              <tbody>
                {detail.tests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-slate-500">
                      No completed tests for this syllabus subject yet.
                    </td>
                  </tr>
                ) : (
                  detail.tests.map((t) => (
                    <tr key={t.testId} className="border-t border-slate-100">
                      <td className="p-2 whitespace-nowrap">{formatDt(t.completedAt)}</td>
                      <td className="p-2 text-right">
                        {t.score != null && t.maxScore != null ? `${t.score} / ${t.maxScore}` : "—"}
                      </td>
                      <td className="p-2 text-right">{t.percentage != null ? `${t.percentage.toFixed(1)}%` : "—"}</td>
                      <td className="p-2 max-w-[200px]">{t.chapters ?? "—"}</td>
                      <td className="p-2 text-slate-600">
                        Q{t.questionCount}
                        {t.difficulty ? ` · ${t.difficulty}` : ""}
                      </td>
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
