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

type TestsByDateItem = {
  testId: string;
  studentId: string;
  studentName: string;
  studentLoginId: string | null;
  classId: string;
  className: string;
  subjectName: string;
  subjectCode: string | null;
  levelName: string;
  percentage: number | null;
  completedAt: string | null;
};

type TestsByDateResponse = {
  dayKey: string;
  fromDayKey: string;
  toDayKey: string;
  count: number;
  items: TestsByDateItem[];
};

type StudentsPayload = {
  students: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
};

const ANALYTICS_PAGE_SIZE = 50;

type DatePreset = "today" | "yesterday" | "last7" | "last30" | "custom";

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

function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function TeacherAnalyticsPage() {
  const { logout, auth } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [classId, setClassId] = useState("ALL");
  const [subjectId, setSubjectId] = useState<string>("ALL");
  const [levelId, setLevelId] = useState("ALL");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchStudent[]>([]);
  const [weakTopics, setWeakTopics] = useState<TopicWeak[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [detailStudent, setDetailStudent] = useState<StudentDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const historyPanelRef = useRef<HTMLElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customDate, setCustomDate] = useState(todayLocalYmd);
  const [testsByDate, setTestsByDate] = useState<TestsByDateResponse | null>(null);
  const [testsByDateLoading, setTestsByDateLoading] = useState(false);
  const [testsByDateErr, setTestsByDateErr] = useState<string | null>(null);

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
          if (prev === "ALL") return "ALL";
          if (prev && list.some((s) => s.id === prev)) return prev;
          return "ALL";
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
    if (subjectId && subjectId !== "ALL" && !list.some((s) => s.id === subjectId)) {
      const cur = subjects.find((s) => s.id === subjectId);
      if (cur) return [cur, ...list];
    }
    return list;
  }, [subjects, subjectSearch, subjectId]);

  const levelsForSubject = useMemo(() => {
    if (subjectId === "ALL") return [];
    const s = subjects.find((x) => x.id === subjectId);
    return s?.levels ?? [];
  }, [subjects, subjectId]);

  useEffect(() => {
    if (subjectId === "ALL") {
      setLevelId("ALL");
      return;
    }
    setLevelId((prev) => {
      if (prev === "ALL") return "ALL";
      return levelsForSubject.some((l) => l.id === prev) ? prev : "ALL";
    });
  }, [subjectId, levelsForSubject]);

  useEffect(() => {
    setStudentPage(1);
  }, [classId, status, subjectId, levelId, selectedStudentId]);

  useEffect(() => {
    void (async () => {
      if (!subjectId || subjectId === "ALL") {
        setWeakTopics([]);
        setStudents([]);
        setStudentTotal(0);
        return;
      }
      const qClass = classId !== "ALL" ? `classId=${encodeURIComponent(classId)}&` : "";
      const qStatus = status !== "ALL" ? `status=${encodeURIComponent(status)}&` : "";
      const qLevel = levelId !== "ALL" ? `levelId=${encodeURIComponent(levelId)}&` : "";
      const qStudent = selectedStudentId ? `studentId=${encodeURIComponent(selectedStudentId)}&` : "";
      const qPage = selectedStudentId
        ? ""
        : `page=${studentPage}&pageSize=${ANALYTICS_PAGE_SIZE}&`;
      const q = `?${qClass}${qLevel}${qStatus}${qStudent}${qPage}subjectId=${encodeURIComponent(subjectId)}`;
      const [w, s] = await Promise.all([
        api<{ weakest: TopicWeak[] }>(`/api/v1/teacher/analytics/weak-topics${q}`),
        api<StudentsPayload>(`/api/v1/teacher/analytics/students${q}`),
      ]);
      if (w.ok) setWeakTopics(w.data?.weakest ?? []);
      if (s.ok) {
        setStudents(s.data?.students ?? []);
        setStudentTotal(s.data?.total ?? s.data?.students?.length ?? 0);
      }
    })();
  }, [classId, status, subjectId, levelId, selectedStudentId, studentPage]);

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
    void (async () => {
      setTestsByDateLoading(true);
      setTestsByDateErr(null);
      const q = new URLSearchParams();
      if (classId !== "ALL") q.set("classId", classId);
      q.set("preset", datePreset);
      if (datePreset === "custom") q.set("date", customDate);
      if (subjectId && subjectId !== "ALL") q.set("subjectId", subjectId);
      if (levelId !== "ALL" && subjectId !== "ALL") q.set("levelId", levelId);
      const r = await api<TestsByDateResponse>(`/api/v1/teacher/analytics/tests-by-date?${q.toString()}`);
      setTestsByDateLoading(false);
      if (!r.ok) {
        setTestsByDate(null);
        setTestsByDateErr(r.error ?? "Could not load tests for this date");
        return;
      }
      setTestsByDate(r.data ?? null);
    })();
  }, [classId, datePreset, customDate, subjectId, levelId]);

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
    setDetailStudent(null);
    setDetailError(null);
    setDetailLoadingId(studentId);
    try {
      const q =
        subjectId && subjectId !== "ALL"
          ? `?subjectId=${encodeURIComponent(subjectId)}`
          : "";
      const r = await api<StudentDetail>(
        `/api/v1/teacher/analytics/student/${encodeURIComponent(studentId)}/detail${q}`
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
        Filter by class, subject, and level (All classes / All subjects supported for Tests by date). Open a
        student&apos;s history from the date table or the list below.
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
          disabled={subjects.length === 0}
        >
          <option value="ALL">All subjects</option>
          {filteredSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.code ? ` (${s.code})` : ""}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border px-3 py-2"
          value={levelId}
          onChange={(e) => setLevelId(e.target.value)}
          disabled={subjectId === "ALL" || levelsForSubject.length === 0}
          title={subjectId === "ALL" ? "Pick a subject to filter by level" : undefined}
        >
          <option value="ALL">All levels</option>
          {levelsForSubject.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-5 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Tests by date</h2>
            <p className="text-sm text-slate-600 mt-1">
              Who completed a skill test today, yesterday, last 7 days, last 30 days, or on a date you pick
              (school day, IST). Uses the class / subject / level filters above — All classes and All subjects
              are supported.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Today"],
                ["yesterday", "Yesterday"],
                ["last7", "Last 7 days"],
                ["last30", "Last 30 days"],
                ["custom", "Pick date"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDatePreset(value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  datePreset === value
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
            {datePreset === "custom" ? (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              />
            ) : null}
          </div>
        </div>

        {testsByDateLoading ? (
          <p className="mt-4 text-sm text-slate-600">Loading…</p>
        ) : testsByDateErr ? (
          <p className="mt-4 text-sm text-red-600">{testsByDateErr}</p>
        ) : testsByDate ? (
          <>
            <p className="mt-3 text-sm text-slate-700">
              <span className="font-medium">{testsByDate.count}</span> completed test
              {testsByDate.count === 1 ? "" : "s"}
              {classId === "ALL" ? " across all classes" : ""}
              {subjectId === "ALL" ? " and all subjects" : ""}
              {testsByDate.fromDayKey === testsByDate.toDayKey ? (
                <>
                  {" "}
                  on <span className="font-medium">{testsByDate.fromDayKey}</span>
                </>
              ) : (
                <>
                  {" "}
                  from <span className="font-medium">{testsByDate.fromDayKey}</span> to{" "}
                  <span className="font-medium">{testsByDate.toDayKey}</span>
                </>
              )}
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2">Student</th>
                    <th className="text-left p-2">Class</th>
                    <th className="text-left p-2">Subject</th>
                    <th className="text-left p-2">Level</th>
                    <th className="text-right p-2">Score %</th>
                    <th className="text-left p-2">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {testsByDate.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-3 text-slate-500">
                        No completed skill tests for this filter in that period.
                      </td>
                    </tr>
                  ) : (
                    testsByDate.items.map((t) => (
                      <tr key={t.testId} className="border-t border-slate-100">
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-left font-medium text-indigo-700 hover:underline"
                            onClick={() => void openStudentDetail(t.studentId)}
                          >
                            {t.studentName}
                          </button>
                          {t.studentLoginId ? (
                            <span className="block text-xs text-slate-500">{t.studentLoginId}</span>
                          ) : null}
                        </td>
                        <td className="p-2">{t.className}</td>
                        <td className="p-2">
                          {t.subjectName}
                          {t.subjectCode ? (
                            <span className="text-xs text-slate-500"> ({t.subjectCode})</span>
                          ) : null}
                        </td>
                        <td className="p-2">{t.levelName}</td>
                        <td className="p-2 text-right">
                          {t.percentage != null ? t.percentage.toFixed(1) : "—"}
                        </td>
                        <td className="p-2 whitespace-nowrap">{formatTestDate(t.completedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
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
                    disabled={detailLoadingId !== null}
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
                  {subjectId && subjectId !== "ALL"
                    ? "No students found."
                    : "Select a subject to load student analytics (Tests by date still works with All subjects)."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {!selectedStudentId && studentTotal > ANALYTICS_PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 text-sm text-slate-600">
            <p>
              Showing {(studentPage - 1) * ANALYTICS_PAGE_SIZE + (shownStudents.length ? 1 : 0)}–
              {Math.min(studentPage * ANALYTICS_PAGE_SIZE, studentTotal)} of {studentTotal}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={studentPage <= 1}
                onClick={() => setStudentPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={studentPage * ANALYTICS_PAGE_SIZE >= studentTotal}
                onClick={() => setStudentPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
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
