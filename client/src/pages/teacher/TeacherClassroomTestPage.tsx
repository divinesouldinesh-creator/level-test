import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api, mediaUrl } from "../../api";
import { teacherPortalNav } from "./teacherPortalNav";
import { todayIso } from "../../attendanceReport";
import { SPEAKING_RUBRIC, isSpeakingSubject } from "../../speakingLevels";

type Kind = "MARKS" | "ORAL";
type SectionRow = { id: string; name: string };
type ClassRow = {
  id: string;
  name: string;
  grade: string | null;
  studentCount: number;
  sections: SectionRow[];
};
type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  levels: { id: string; name: string; order: number }[];
};
type LastMarks = {
  date: string;
  score: number;
  maxScore: number;
  percentage: number;
  levelName: string | null;
};
type LastOral = {
  date: string;
  levelId: string;
  levelName: string;
  levelOrder: number;
};
type RosterStudent = {
  studentId: string;
  fullName: string;
  studentLoginId: string | null;
  absent: boolean;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  judgedLevelId: string | null;
  remark: string;
  lastMarks: LastMarks | null;
  lastOral: LastOral | null;
};
type RosterResponse = {
  notes: string;
  saved: boolean;
  levels: { id: string; name: string; order: number }[];
  students: RosterStudent[];
  snapshot: {
    total: number;
    savedCount: number;
    absent: number;
    byLevel: { levelId: string; levelName: string; order: number; count: number }[];
  };
};

type Tab = "mark" | "records";
type RecordsView = "class" | "student";
type SnapshotStudent = {
  studentId: string;
  fullName: string;
  studentLoginId: string | null;
  date: string;
  percentage?: number | null;
  levelName?: string | null;
  concern?: "weak" | "not-improving" | "both" | null;
  previousPercentage?: number | null;
  previousDate?: string | null;
};
type SnapshotLevel = {
  levelId: string;
  order: number;
  name: string;
  count: number;
  students: SnapshotStudent[];
};
type SnapshotResponse = {
  kind: Kind;
  total: number;
  assessed: number;
  notAssessed: number;
  passMark: number | null;
  belowPass: { count: number; students: SnapshotStudent[] };
  byLevel: SnapshotLevel[];
};
type RecordRow = {
  studentId: string;
  fullName: string;
  studentLoginId: string | null;
  absent: boolean;
  recorded: boolean;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  judgedLevelOrder: number | null;
  lastMarks: LastMarks | null;
  lastOral: LastOral | null;
  movement: "Up" | "Down" | "Same" | null;
};
type RecordsResponse = {
  kind: Kind;
  saved: boolean;
  students: RecordRow[];
  summary: {
    total: number;
    absent: number;
    assessed: number;
    avg: number | null;
    up: number;
    down: number;
    same: number;
    byLevel: { order: number; name: string; count: number }[];
  };
};
type HistoryItem = {
  entryId: string;
  date: string;
  absent: boolean;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  testedLevelId: string | null;
  testedLevelName: string | null;
  judgedLevelOrder: number | null;
  judgedLevelName: string | null;
};
type SectionStudent = { id: string; fullName: string; studentLoginId: string | null };
type BoardQuestion = {
  id: string;
  stem: string;
  stemImageUrl: string | null;
  answer: string;
  answerImageUrl: string | null;
};
type BoardQuestionsResponse = {
  levelName: string;
  questionCount: number;
  warnings: string[];
  questions: BoardQuestion[];
};

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function bandClass(pct: number): string {
  if (pct >= 80) return "text-emerald-700";
  if (pct >= 50) return "text-amber-700";
  return "text-red-600";
}

export function TeacherClassroomTestPage() {
  const { logout, auth } = useAuth();
  const [tab, setTab] = useState<Tab>("mark");
  const [recordsView, setRecordsView] = useState<RecordsView>("class");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [testedLevelId, setTestedLevelId] = useState("");
  const [date, setDate] = useState(() => todayIso());
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<RosterStudent[]>([]);
  const [levels, setLevels] = useState<{ id: string; name: string; order: number }[]>([]);
  const [saved, setSaved] = useState(false);
  const [defaultMax, setDefaultMax] = useState("20");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recordRows, setRecordRows] = useState<RecordRow[]>([]);
  const [recordSummary, setRecordSummary] = useState<RecordsResponse["summary"] | null>(null);
  const [recordSaved, setRecordSaved] = useState(false);
  const [historyStudent, setHistoryStudent] = useState<{
    id: string;
    fullName: string;
    studentLoginId: string | null;
  } | null>(null);
  const [historyLevelId, setHistoryLevelId] = useState("");
  const [sectionStudents, setSectionStudents] = useState<SectionStudent[]>([]);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [questionItems, setQuestionItems] = useState<BoardQuestion[]>([]);
  const [questionWarnings, setQuestionWarnings] = useState<string[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const questionPaperKey = useRef("");
  const [pickedStudentId, setPickedStudentId] = useState("");
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [recordDates, setRecordDates] = useState<string[]>([]);
  const [levelSnapshot, setLevelSnapshot] = useState<SnapshotResponse | null>(null);
  const [openLevelId, setOpenLevelId] = useState<string | null>(null);
  const [detailCutoff, setDetailCutoff] = useState("75");
  const [latestTest, setLatestTest] = useState<{
    testedLevelId: string;
    testedLevelName: string;
    levelOrder: number;
    date: string;
  } | null>(null);
  const [latestLoaded, setLatestLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/teacher/classes");
      if (!r.ok) {
        setError(r.error ?? "Could not load classes");
        return;
      }
      const classList = r.data ?? [];
      setClasses(classList);
      if (classList[0]) {
        setClassId(classList[0].id);
        setSectionId(classList[0].sections[0]?.id ?? "");
      }
    })();
  }, []);

  const selectedClass = classes.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];
  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const subjectLevels = selectedSubject?.levels ?? [];
  const kind: Kind = isSpeakingSubject(selectedSubject) ? "ORAL" : "MARKS";

  useEffect(() => {
    if (sections.length === 0) {
      setSectionId("");
      return;
    }
    if (!sections.some((s) => s.id === sectionId)) {
      setSectionId(sections[0]!.id);
    }
  }, [classId, sections, sectionId]);

  useEffect(() => {
    setRows([]);
    setPickedStudentId("");
    setHistoryStudent(null);
    setHistoryItems([]);
  }, [classId, sectionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!sectionId) {
        setSectionStudents([]);
        return;
      }
      const r = await api<SectionStudent[]>(
        `/api/v1/teacher/sections/${encodeURIComponent(sectionId)}/students`
      );
      if (cancelled) return;
      setSectionStudents(r.ok ? r.data ?? [] : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [sectionId]);

  useEffect(() => {
    void (async () => {
      if (!classId) {
        setSubjects([]);
        setSubjectId("");
        return;
      }
      const r = await api<SubjectRow[]>(
        `/api/v1/teacher/subjects?classId=${encodeURIComponent(classId)}`
      );
      if (!r.ok) {
        setError(r.error ?? "Could not load subjects");
        setSubjects([]);
        setSubjectId("");
        return;
      }
      const list = r.data ?? [];
      setSubjects(list);
      setSubjectId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        return list[0]?.id ?? "";
      });
    })();
  }, [classId]);

  useEffect(() => {
    if (subjectLevels.length === 0) {
      setTestedLevelId("");
      return;
    }
    if (!subjectLevels.some((l) => l.id === testedLevelId)) {
      setTestedLevelId(subjectLevels[0]!.id);
    }
  }, [subjectId, subjectLevels, testedLevelId]);

  useEffect(() => {
    questionPaperKey.current = "";
    setQuestionsOpen(false);
    setQuestionItems([]);
    setQuestionWarnings([]);
    setQuestionsError(null);
  }, [subjectId]);

  useEffect(() => {
    questionPaperKey.current = "";
    setQuestionItems([]);
    setQuestionWarnings([]);
    setQuestionsError(null);
    setQuestionsLoading(true);
  }, [testedLevelId]);

  useEffect(() => {
    if (!questionsOpen || kind !== "MARKS" || !subjectId || !testedLevelId) return;
    const key = `${subjectId}:${testedLevelId}`;
    if (questionPaperKey.current === key) {
      setQuestionsLoading(false);
      return;
    }
    let cancelled = false;
    setQuestionsLoading(true);
    setQuestionsError(null);
    const q = new URLSearchParams({ subjectId, levelId: testedLevelId });
    void (async () => {
      const r = await api<BoardQuestionsResponse>(
        `/api/v1/teacher/classroom-assessments/questions?${q.toString()}`
      );
      if (cancelled) return;
      setQuestionsLoading(false);
      if (!r.ok || !r.data) {
        setQuestionItems([]);
        setQuestionWarnings([]);
        setQuestionsError(r.error ?? "Could not load questions");
        return;
      }
      questionPaperKey.current = key;
      setQuestionItems(r.data.questions ?? []);
      setQuestionWarnings(r.data.warnings ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [questionsOpen, kind, subjectId, testedLevelId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (tab !== "mark") return;
      if (!classId || !sectionId || !subjectId || !date) {
        setRows([]);
        setSaved(false);
        setNotes("");
        return;
      }
      if (selectedClass && !selectedClass.sections.some((s) => s.id === sectionId)) {
        return;
      }
      if (kind === "MARKS" && !testedLevelId) {
        setRows([]);
        setSaved(false);
        setNotes("");
        return;
      }
      const subject = subjects.find((s) => s.id === subjectId);
      if (!subject) return;
      if (kind === "MARKS" && !subject.levels.some((l) => l.id === testedLevelId)) {
        setRows([]);
        setSaved(false);
        setNotes("");
        return;
      }
      setRows([]);
      setSaved(false);
      setNotes("");
      setLoading(true);
      setError(null);
      setMessage(null);
      const q = new URLSearchParams({
        classId,
        sectionId,
        subjectId,
        kind,
        date,
      });
      if (kind === "MARKS") q.set("testedLevelId", testedLevelId);
      const r = await api<RosterResponse>(`/api/v1/teacher/classroom-assessments?${q.toString()}`);
      if (cancelled) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.error ?? "Could not load roster");
        return;
      }
      setNotes(r.data.notes ?? "");
      setSaved(r.data.saved);
      setLevels(r.data.levels ?? []);
      const alreadySaved = r.data.saved;
      const savedMax = (r.data.students ?? []).find((s) => s.maxScore != null)?.maxScore;
      if (kind === "MARKS" && savedMax != null && savedMax > 0) {
        setDefaultMax(String(savedMax));
      }
      const maxHint = savedMax ?? Number.parseInt(defaultMax, 10);
      setRows(
        (r.data.students ?? []).map((s) => ({
          ...s,
          maxScore:
            s.maxScore ??
            (kind === "MARKS" && Number.isFinite(maxHint) && maxHint > 0 ? maxHint : s.maxScore),
          judgedLevelId: s.judgedLevelId,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, classId, sectionId, subjectId, kind, date, testedLevelId, subjects, selectedClass]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!classId || !sectionId || !subjectId) {
        setRecordDates([]);
        return;
      }
      if (kind === "MARKS" && !testedLevelId) {
        setRecordDates([]);
        return;
      }
      const subject = subjects.find((s) => s.id === subjectId);
      if (!subject) return;
      if (kind === "MARKS" && !subject.levels.some((l) => l.id === testedLevelId)) return;
      setRecordDates([]);
      const q = new URLSearchParams({ classId, sectionId, subjectId });
      if (kind === "MARKS") q.set("testedLevelId", testedLevelId);
      const r = await api<{ dates: string[]; latest: string | null }>(
        `/api/v1/teacher/classroom-assessments/dates?${q.toString()}`
      );
      if (cancelled) return;
      const dates = r.ok ? r.data?.dates ?? [] : [];
      setRecordDates(dates);
      if (tab === "records" && dates.length > 0) {
        setDate((prev) => (dates.includes(prev) ? prev : dates[0]!));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, sectionId, subjectId, tab, kind, testedLevelId, subjects]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (tab !== "records" || kind !== "MARKS" || !classId || !sectionId || !subjectId) {
        setLatestTest(null);
        setLatestLoaded(false);
        return;
      }
      setLatestLoaded(false);
      const q = new URLSearchParams({ classId, sectionId, subjectId });
      const r = await api<{
        latest: {
          testedLevelId: string;
          testedLevelName: string;
          levelOrder: number;
          date: string;
        } | null;
      }>(`/api/v1/teacher/classroom-assessments/latest?${q.toString()}`);
      if (cancelled) return;
      const latest = r.ok ? r.data?.latest ?? null : null;
      setLatestTest(latest);
      setLatestLoaded(true);
      if (latest) {
        setTestedLevelId(latest.testedLevelId);
        setDate(latest.date);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, kind, classId, sectionId, subjectId]);

  useEffect(() => {
    void (async () => {
      if (tab !== "records" || !classId || !sectionId || !subjectId) {
        setLevelSnapshot(null);
        setOpenLevelId(null);
        return;
      }
      setLevelSnapshot(null);
      setOpenLevelId(null);
      const q = new URLSearchParams({ classId, sectionId, subjectId });
      const r = await api<SnapshotResponse>(
        `/api/v1/teacher/classroom-assessments/snapshot?${q.toString()}`
      );
      if (!r.ok || !r.data) {
        setLevelSnapshot(null);
        return;
      }
      setLevelSnapshot(r.data);
    })();
  }, [tab, kind, classId, sectionId, subjectId]);

  useEffect(() => {
    void (async () => {
      if (tab !== "records") return;
      if (!classId || !sectionId || !subjectId) {
        setRecordRows([]);
        setRecordSummary(null);
        setRecordSaved(false);
        return;
      }
      if (kind === "MARKS" && !testedLevelId) {
        setRecordRows([]);
        setRecordSummary(null);
        setRecordSaved(false);
        return;
      }
      if (recordDates.length === 0) {
        setRecordRows([]);
        setRecordSummary(null);
        setRecordSaved(false);
        return;
      }
      if (!recordDates.includes(date)) return;
      setLoading(true);
      setError(null);
      const q = new URLSearchParams({ classId, sectionId, subjectId, date });
      if (kind === "MARKS") q.set("testedLevelId", testedLevelId);
      const r = await api<RecordsResponse>(`/api/v1/teacher/classroom-assessments/records?${q.toString()}`);
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.error ?? "Could not load records");
        setRecordRows([]);
        setRecordSummary(null);
        return;
      }
      setRecordSaved(r.data.saved);
      setRecordRows(r.data.students ?? []);
      setRecordSummary(r.data.summary ?? null);
    })();
  }, [tab, classId, sectionId, subjectId, date, recordDates, kind, testedLevelId]);

  const classMax = Number.parseInt(defaultMax, 10);
  const classMaxOk = Number.isFinite(classMax) && classMax > 0;

  const markedCount = useMemo(
    () => rows.filter((r) => kind === "ORAL" && !r.absent && Boolean(r.judgedLevelId)).length,
    [rows, kind]
  );

  const readyCount = useMemo(() => {
    return rows.filter((r) => {
      if (r.absent) return true;
      if (kind === "ORAL") return Boolean(r.judgedLevelId);
      return classMaxOk && r.score != null && r.score <= classMax;
    }).length;
  }, [rows, kind, classMaxOk, classMax]);

  const canSave =
    kind === "ORAL"
      ? markedCount > 0 && !saving && !loading
      : rows.length > 0 && readyCount === rows.length && !saving && !loading && classMaxOk;

  const snapshot = useMemo(() => {
    const absent = rows.filter((r) => r.absent).length;
    const byLevel = levels.map((l) => ({
      ...l,
      count: rows.filter((r) => !r.absent && r.judgedLevelId === l.id).length,
    }));
    const scored = rows.filter((r) => !r.absent && r.score != null && classMaxOk);
    const avg =
      scored.length > 0
        ? scored.reduce((sum, r) => sum + (100 * (r.score as number)) / classMax, 0) / scored.length
        : null;
    return { total: rows.length, absent, byLevel, readyCount, scoredCount: scored.length, avg };
  }, [rows, levels, readyCount, classMaxOk, classMax]);

  function patchRow(studentId: string, patch: Partial<RosterStudent>) {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)));
    setMessage(null);
  }

  function focusNextScore(index: number) {
    for (let i = index + 1; i < rows.length; i++) {
      const next = document.querySelector<HTMLInputElement>(`[data-score-row="${i}"]`);
      if (next) {
        next.focus();
        next.select();
        return;
      }
    }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const r = await api("/api/v1/teacher/classroom-assessments", {
      method: "PUT",
      json: {
        classId,
        sectionId,
        subjectId,
        kind,
        date,
        notes,
        ...(kind === "MARKS" ? { testedLevelId } : {}),
        entries: (kind === "ORAL" ? rows.filter((row) => row.judgedLevelId) : rows).map((row) => ({
          studentId: row.studentId,
          absent: kind === "ORAL" ? false : row.absent,
          score: kind === "MARKS" && !row.absent ? row.score : null,
          maxScore: kind === "MARKS" && !row.absent ? classMax : null,
          judgedLevelId: kind === "ORAL" ? row.judgedLevelId : null,
          remark: row.remark,
        })),
      },
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save");
      return;
    }
    setSaved(true);
    setMessage(kind === "ORAL" ? "Levels saved." : "Marks saved.");
  }

  useEffect(() => {
    if (!historyStudent) return;
    document.getElementById("student-record")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [historyStudent]);

  async function openHistory(
    studentId: string,
    fullName: string,
    studentLoginId: string | null,
    levelId?: string
  ) {
    if (!subjectId) return;
    setHistoryLoading(true);
    setRecordsView("student");
    setPickedStudentId(studentId);
    setHistoryStudent({ id: studentId, fullName, studentLoginId });
    setHistoryLevelId(levelId ?? "");
    setHistoryItems([]);
    const q = new URLSearchParams({ studentId, subjectId });
    if (kind === "MARKS" && levelId) q.set("testedLevelId", levelId);
    const r = await api<{ items: HistoryItem[] }>(
      `/api/v1/teacher/classroom-assessments/history?${q.toString()}`
    );
    setHistoryLoading(false);
    if (!r.ok || !r.data) {
      setError(r.error ?? "Could not load history");
      return;
    }
    setHistoryItems(r.data.items ?? []);
  }

  return (
    <AppShell title={auth.profile?.fullName ?? "Teacher"} onLogout={logout} nav={[...teacherPortalNav]}>
      <h1 className="text-2xl font-bold text-slate-900">Class tests</h1>
      <p className="text-slate-600 mt-1">Mark a class test, or open Records to see this vs last.</p>

      <div className="mt-4 flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
        {(
          [
            ["mark", "Mark"],
            ["records", "Records"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[120px] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
              tab === id
                ? "bg-white text-brand-900 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <p className="text-sm text-slate-600">
          {tab === "records"
            ? recordsView === "student"
              ? kind === "ORAL"
                ? "Choose a student to see the speaking levels they have been given."
                : "Choose a student to see their tests."
              : kind === "MARKS"
                ? "See who cleared each level, or open the latest test."
                : "See how many students are at each speaking level."
            : kind === "ORAL"
              ? "Tap a level only for the students you heard today. Leave the others blank."
              : "Type the score for each student. Set “out of” once. Enter jumps to the next name."}
        </p>
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
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Subject / branch</span>
            <select
              className="w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={!classId || !sectionId}
            >
              <option value="">
                {!classId || !sectionId
                  ? "Select class and section first"
                  : subjects.length === 0
                    ? "No subjects for this class"
                    : "Select subject"}
              </option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ""}
                </option>
              ))}
            </select>
          </label>
          {tab === "mark" ? (
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Date</span>
              <input
                type="date"
                className="w-full rounded-lg border px-3 py-2"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          ) : null}
          {tab === "mark" && kind === "MARKS" ? (
            <div className="text-sm">
              <label>
                <span className="block text-slate-600 mb-1">Level tested</span>
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={testedLevelId}
                  onChange={(e) => setTestedLevelId(e.target.value)}
                  disabled={subjectLevels.length === 0}
                >
                  <option value="">Select level</option>
                  {subjectLevels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="mt-2 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 min-h-[44px] disabled:opacity-50"
                onClick={() => {
                  const next = !questionsOpen;
                  const key = `${subjectId}:${testedLevelId}`;
                  if (next && questionPaperKey.current !== key) setQuestionsLoading(true);
                  setQuestionsOpen(next);
                }}
                disabled={!testedLevelId}
              >
                {questionsOpen ? "Hide questions" : "Questions"}
              </button>
            </div>
          ) : null}
          {tab === "mark" && kind === "MARKS" ? (
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Out of (max score)</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                className="w-full rounded-lg border px-3 py-2"
                value={defaultMax}
                onChange={(e) => setDefaultMax(e.target.value)}
              />
            </label>
          ) : null}
        </div>
        {tab === "mark" && kind === "MARKS" && questionsOpen && testedLevelId ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <p className="text-sm text-slate-600">
              {questionItems.length > 0 ? `${questionItems.length} questions for ` : ""}
              {subjectLevels.find((l) => l.id === testedLevelId)?.name ?? "This level"}. Write each question on the board. The answer stays here.
            </p>
            {questionsLoading ? <p className="text-sm text-slate-600">Loading questions…</p> : null}
            {questionsError ? <p className="text-sm text-red-600">{questionsError}</p> : null}
            {questionWarnings.map((warning) => (
              <p key={warning} className="text-sm text-amber-700">
                {warning}
              </p>
            ))}
            {!questionsLoading && !questionsError && questionItems.length === 0 ? (
              <p className="text-sm text-slate-600">No questions for this level yet.</p>
            ) : null}
            {questionItems.map((q, i) => {
              const stemSrc = mediaUrl(q.stemImageUrl);
              const answerSrc = mediaUrl(q.answerImageUrl);
              return (
                <div key={q.id} className="rounded-lg border bg-white p-3">
                  <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap">
                    {i + 1}. {q.stem}
                  </p>
                  {stemSrc ? (
                    <img src={stemSrc} alt="" className="mt-2 max-h-56 rounded-lg border border-slate-100" />
                  ) : null}
                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                    <span className="font-medium text-slate-500">Answer: </span>
                    {q.answer || (answerSrc ? "" : "—")}
                  </p>
                  {answerSrc ? (
                    <img src={answerSrc} alt="" className="mt-2 max-h-40 rounded-lg border border-slate-100" />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {tab === "mark" ? (
          <>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
            <button
              type="button"
              className="w-full rounded-lg bg-indigo-600 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50 min-h-[44px]"
              onClick={() => void save()}
              disabled={!canSave}
            >
              {saving ? "Saving…" : saved ? "Save changes" : "Save class results"}
            </button>
            <p className="text-xs text-slate-500">
              {kind === "ORAL"
                ? `${markedCount} student${markedCount === 1 ? "" : "s"} marked`
                : `${readyCount}/${rows.length || 0} students ready`}
            </p>
          </>
        ) : null}
        {loading ? <p className="text-sm text-slate-500">Loading students…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {tab === "mark" && !loading && !error && classId && sectionId && subjectId && rows.length === 0 ? (
          <p className="text-sm text-slate-500">No students in this class and section.</p>
        ) : null}
      </section>

      {tab === "mark" && kind === "ORAL" && levels.length > 0 ? (
        <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
          <h2 className="font-semibold text-slate-900">Speaking levels</h2>
          <p className="text-sm text-slate-600 mt-1">Mark only the students you heard. Tap a level again to clear it.</p>
          <table className="mt-3 min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="pr-3 py-1 font-medium">Level</th>
                <th className="pr-3 py-1 font-medium">Name</th>
                <th className="pr-3 py-1 font-medium">Time</th>
                <th className="py-1 font-medium">Main requirement</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => {
                const rubric = SPEAKING_RUBRIC.find((r) => r.order === l.order);
                return (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="pr-3 py-1.5 font-semibold">L{l.order}</td>
                    <td className="pr-3 py-1.5">{rubric?.name ?? l.name}</td>
                    <td className="pr-3 py-1.5 whitespace-nowrap">{rubric?.time ?? "—"}</td>
                    <td className="py-1.5">{rubric?.requirement ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 0 ? (
            <p className="text-sm text-slate-600 mt-3">
              {markedCount} marked
              {snapshot.byLevel.map((l) => (
                <span key={l.id}>
                  {" "}
                  · L{l.order} {l.count}
                </span>
              ))}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "mark" && kind === "ORAL" && !loading && rows.length > 0 ? (
        <section className="mt-4 rounded-xl border bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">Student</th>
                <th className="text-left p-3">Level</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const lastOral = row.lastOral;
                const judged = levels.find((l) => l.id === row.judgedLevelId);
                let movement: string | null = null;
                if (!row.absent && judged && lastOral) {
                  if (judged.order > lastOral.levelOrder) movement = "Up";
                  else if (judged.order < lastOral.levelOrder) movement = "Down";
                  else movement = "Same";
                }
                return (
                  <tr key={row.studentId} className="border-t border-slate-100 align-top">
                    <td className="p-3 min-w-[140px]">
                      <p className="font-medium text-slate-900">{row.fullName}</p>
                      <p className="text-xs text-slate-500">{row.studentLoginId ?? "—"}</p>
                      {lastOral && !row.judgedLevelId ? (
                        <p className="text-xs text-indigo-700 mt-1">
                          Now: L{lastOral.levelOrder} · {formatDay(lastOral.date)}
                        </p>
                      ) : lastOral ? (
                        <p className="text-xs text-slate-600 mt-1">
                          Last: L{lastOral.levelOrder}
                          {movement ? ` · ${movement}` : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-1">No level yet</p>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {levels.map((l) => {
                          const selected = row.judgedLevelId === l.id;
                          const current = !selected && lastOral?.levelId === l.id;
                          return (
                            <button
                              key={l.id}
                              type="button"
                              title={current ? `${l.name} · current level` : l.name}
                              onClick={() =>
                                patchRow(row.studentId, {
                                  absent: false,
                                  judgedLevelId: selected ? null : l.id,
                                })
                              }
                              className={`rounded-lg px-2.5 py-2 text-sm font-medium min-h-[40px] min-w-[44px] border ${
                                selected
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : current
                                    ? "bg-indigo-50 text-indigo-800 border-indigo-600 border-2"
                                    : "bg-white text-slate-700 border-slate-300"
                              }`}
                            >
                              L{l.order}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "mark" && kind === "MARKS" && !loading && rows.length > 0 ? (
        <section className="mt-4 rounded-xl border bg-white shadow-sm overflow-x-auto">
          <div className="px-3 py-2 border-b border-slate-100 text-sm text-slate-600">
            {snapshot.absent} absent · {snapshot.scoredCount} scored
            {snapshot.avg != null ? ` · class avg ${snapshot.avg.toFixed(0)}%` : ""}
            {classMaxOk ? ` · out of ${classMax}` : ""}
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">Student</th>
                <th className="text-left p-3 w-20">Abs</th>
                <th className="text-left p-3 w-28">Score</th>
                <th className="text-right p-3 w-16">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const pct =
                  !row.absent && row.score != null && classMaxOk ? (100 * row.score) / classMax : null;
                const overMax = row.score != null && classMaxOk && row.score > classMax;
                return (
                  <tr key={row.studentId} className="border-t border-slate-100">
                    <td className="p-3 min-w-[140px]">
                      <p className="font-medium text-slate-900">{row.fullName}</p>
                      <p className="text-xs text-slate-500">{row.studentLoginId ?? "—"}</p>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() =>
                          patchRow(row.studentId, {
                            absent: !row.absent,
                            score: !row.absent ? null : row.score,
                          })
                        }
                        className={`rounded-lg px-2.5 py-2 text-sm font-medium min-h-[40px] border ${
                          row.absent
                            ? "bg-slate-700 text-white border-slate-700"
                            : "bg-white text-slate-700 border-slate-300"
                        }`}
                      >
                        Abs
                      </button>
                    </td>
                    <td className="p-3">
                      {row.absent ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            data-score-row={index}
                            type="number"
                            min={0}
                            max={classMaxOk ? classMax : undefined}
                            inputMode="numeric"
                            className={`w-20 rounded-lg border px-2 py-2 text-base min-h-[40px] ${
                              overMax ? "border-red-400 bg-red-50" : "border-slate-300"
                            }`}
                            value={row.score ?? ""}
                            onChange={(e) => {
                              const n = Number.parseInt(e.target.value, 10);
                              patchRow(row.studentId, { score: Number.isFinite(n) ? n : null });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                focusNextScore(index);
                              }
                            }}
                          />
                          <span className="text-slate-500 text-xs whitespace-nowrap">
                            / {classMaxOk ? classMax : "?"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {pct == null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className={`font-semibold ${bandClass(pct)}`}>{pct.toFixed(0)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "records" ? (
        <div className="mt-4 flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
          {(
            [
              ["class", "Class"],
              ["student", "One student"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRecordsView(id)}
              className={`flex-1 min-w-[120px] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                recordsView === id
                  ? "bg-white text-brand-900 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "records" && recordsView === "class" ? (
        <section className="mt-4 rounded-xl border bg-white shadow-sm">
          {kind === "ORAL" && levelSnapshot ? (
            <div className="p-4 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-900">Who is at each level</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Latest level the teacher marked · {levelSnapshot.assessed} placed · {levelSnapshot.notAssessed}{" "}
                not yet
              </p>
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
                {levelSnapshot.byLevel.map((l) => (
                  <button
                    key={l.levelId}
                    type="button"
                    onClick={() => setOpenLevelId((id) => (id === l.levelId ? null : l.levelId))}
                    className={`rounded-xl border p-3 text-center min-h-[72px] ${
                      openLevelId === l.levelId
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <p className="text-xs font-medium text-slate-600">L{l.order}</p>
                    <p className="text-2xl font-bold text-slate-900">{l.count}</p>
                  </button>
                ))}
              </div>
              {openLevelId ? (
                <ul className="mt-3 text-sm text-slate-700 space-y-1">
                  {(levelSnapshot.byLevel.find((l) => l.levelId === openLevelId)?.students ?? []).length ===
                  0 ? (
                    <li className="text-slate-500">No students at this level yet.</li>
                  ) : (
                    (levelSnapshot.byLevel.find((l) => l.levelId === openLevelId)?.students ?? []).map((s) => (
                      <li key={s.studentId}>
                        <button
                          type="button"
                          className="text-left font-medium text-indigo-700 hover:underline"
                          onClick={() => void openHistory(s.studentId, s.fullName, s.studentLoginId)}
                        >
                          {s.fullName}
                        </button>
                        <span className="text-xs text-slate-500"> · last updated {formatDay(s.date)}</span>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Tap a level to see who is there.</p>
              )}
            </div>
          ) : null}
          {kind === "MARKS" && levelSnapshot ? (
            <div className="p-4 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-900">How many cleared each level</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Each number is students at {levelSnapshot.passMark ?? 75}% or above.{" "}
                {levelSnapshot.notAssessed} not yet tested.
              </p>
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                {levelSnapshot.byLevel.map((l) => (
                  <button
                    key={l.levelId}
                    type="button"
                    onClick={() => setOpenLevelId((id) => (id === l.levelId ? null : l.levelId))}
                    className={`rounded-xl border p-3 text-center min-h-[72px] ${
                      openLevelId === l.levelId
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <p className="text-xs font-medium text-slate-600">L{l.order}</p>
                    <p className="text-2xl font-bold text-slate-900">{l.count}</p>
                  </button>
                ))}
              </div>
              {openLevelId ? (
                <>
                  <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                    <span>Show students below</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      inputMode="numeric"
                      className="w-20 rounded-lg border px-2 py-1.5"
                      value={detailCutoff}
                      onChange={(e) => setDetailCutoff(e.target.value)}
                    />
                    <span>%</span>
                  </label>
                  <ul className="mt-3 text-sm text-slate-700 space-y-1">
                    {(() => {
                      const cutoff = Number.parseInt(detailCutoff, 10);
                      const cutoffOk = Number.isFinite(cutoff) && cutoff > 0 && cutoff <= 100;
                      const opened = (
                        levelSnapshot.byLevel.find((l) => l.levelId === openLevelId)?.students ?? []
                      ).filter((s) => cutoffOk && (s.percentage == null || s.percentage < cutoff));
                      if (!cutoffOk) {
                        return <li className="text-slate-500">Enter a cutoff from 1 to 100.</li>;
                      }
                      if (opened.length === 0) {
                        return <li className="text-slate-500">No students below {cutoff}% on this level.</li>;
                      }
                      return opened.map((s) => (
                        <li key={s.studentId}>
                          <button
                            type="button"
                            className="text-left font-medium text-indigo-700 hover:underline"
                            onClick={() =>
                              void openHistory(s.studentId, s.fullName, s.studentLoginId, openLevelId)
                            }
                          >
                            {s.fullName}
                          </button>
                          <span className="text-xs text-slate-500">
                            {s.previousPercentage != null && s.percentage != null
                              ? ` · ${s.previousPercentage.toFixed(0)}% then ${s.percentage.toFixed(0)}%`
                              : s.percentage != null
                                ? ` · ${s.percentage.toFixed(0)}%`
                                : ""}
                            {" · "}
                            {formatDay(s.date)}
                          </span>
                        </li>
                      ));
                    })()}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Tap a level to see students below a cutoff.</p>
              )}
            </div>
          ) : null}
          {kind === "MARKS" ? (
            <div className="p-4 border-b border-slate-100 space-y-3">
              {latestTest ? (
                testedLevelId === latestTest.testedLevelId && date === latestTest.date ? (
                  <p className="text-sm text-slate-700">
                    Latest test: {latestTest.testedLevelName} · {formatDay(latestTest.date)}
                  </p>
                ) : (
                  <button
                    type="button"
                    className="text-sm text-indigo-700 underline"
                    onClick={() => {
                      setTestedLevelId(latestTest.testedLevelId);
                      setDate(latestTest.date);
                    }}
                  >
                    Back to latest test: {latestTest.testedLevelName} · {formatDay(latestTest.date)}
                  </button>
                )
              ) : latestLoaded ? (
                <p className="text-sm text-slate-500">No tests saved for this subject yet.</p>
              ) : null}
              <label className="text-sm block">
                <span className="block text-slate-600 mb-1">Level</span>
                <select
                  className="w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"
                  value={testedLevelId}
                  onChange={(e) => setTestedLevelId(e.target.value)}
                  disabled={subjectLevels.length === 0}
                >
                  <option value="">
                    {subjectLevels.length === 0 ? "This subject has no levels yet" : "Select level"}
                  </option>
                  {subjectLevels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {kind === "MARKS" ? (
          <>
          <div className="p-4 border-b border-slate-100">
            <label className="text-sm block">
              <span className="block text-slate-600 mb-1">Test date</span>
              <select
                className="w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"
                value={recordDates.includes(date) ? date : ""}
                onChange={(e) => setDate(e.target.value)}
                disabled={recordDates.length === 0 || (kind === "MARKS" && !testedLevelId)}
              >
                <option value="">
                  {kind === "MARKS" && !testedLevelId
                    ? "Select a level first"
                    : recordDates.length === 0
                      ? kind === "MARKS"
                        ? "No tests saved for this level yet"
                        : "No tests saved for this subject yet"
                      : "Select date"}
                </option>
                {recordDates.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {recordDates.length > 0 && !recordSaved && !loading ? (
            <p className="p-4 text-sm text-slate-500">No test saved on this date.</p>
          ) : null}
          {recordSaved && recordSummary ? (
            <p className="px-3 py-2 border-b border-slate-100 text-sm text-slate-600">
              {recordSummary.avg != null ? `Class avg ${recordSummary.avg.toFixed(0)}%` : "No scores"}
              {" · "}
              {recordSummary.up} up · {recordSummary.down} down · {recordSummary.same} same
              {recordSummary.absent ? ` · ${recordSummary.absent} absent` : ""}
              {" · compared with the previous test of this level"}
            </p>
          ) : null}
          {recordSaved ? (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">Student</th>
                  <th className="text-left p-3">This</th>
                  <th className="text-left p-3">Last</th>
                  <th className="text-left p-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {recordRows.map((row) => (
                  <tr key={row.studentId} className="border-t border-slate-100">
                    <td className="p-3">
                      <button
                        type="button"
                        className="text-left font-medium text-indigo-700 hover:underline"
                        onClick={() =>
                          void openHistory(row.studentId, row.fullName, row.studentLoginId, testedLevelId)
                        }
                      >
                        {row.fullName}
                      </button>
                      <p className="text-xs text-slate-500">{row.studentLoginId ?? "—"}</p>
                    </td>
                    <td className="p-3">
                      {!row.recorded
                        ? "—"
                        : row.absent
                          ? "Abs"
                          : row.score != null && row.maxScore != null
                            ? `${row.score}/${row.maxScore}`
                            : "—"}
                    </td>
                    <td className="p-3">
                      {row.lastMarks
                        ? `${row.lastMarks.score}/${row.lastMarks.maxScore} · ${formatDay(row.lastMarks.date)}`
                        : "—"}
                    </td>
                    <td className="p-3">{row.movement ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          </>
          ) : null}
        </section>
      ) : null}

      {tab === "records" && recordsView === "student" ? (
        <section id="student-record" className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
          <label className="text-sm block">
            <span className="block text-slate-600 mb-1">Student</span>
            <select
              className="w-full rounded-lg border px-3 py-2 disabled:bg-slate-100"
              value={pickedStudentId}
              disabled={!sectionId || sectionStudents.length === 0}
              onChange={(e) => {
                const id = e.target.value;
                setPickedStudentId(id);
                const student = sectionStudents.find((s) => s.id === id);
                if (!student) {
                  setHistoryStudent(null);
                  setHistoryItems([]);
                  return;
                }
                void openHistory(student.id, student.fullName, student.studentLoginId);
              }}
            >
              <option value="">
                {!sectionId
                  ? "Select a section first"
                  : sectionStudents.length === 0
                    ? "No students in this section"
                    : "Select a student"}
              </option>
              {sectionStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                  {s.studentLoginId ? ` (${s.studentLoginId})` : ""}
                </option>
              ))}
            </select>
          </label>
          {historyStudent ? (
            <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">{historyStudent.fullName}</h2>
              <p className="text-xs text-slate-500">{historyStudent.studentLoginId ?? "—"}</p>
            </div>
            <button
              type="button"
              className="text-sm text-slate-600 underline"
              onClick={() => {
                setHistoryStudent(null);
                setHistoryItems([]);
                setPickedStudentId("");
              }}
            >
              Close
            </button>
          </div>
          {kind === "MARKS" ? (
            <label className="mt-3 text-sm block">
              <span className="block text-slate-600 mb-1">Level in this record</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={historyLevelId}
                onChange={(e) => {
                  const next = e.target.value;
                  void openHistory(
                    historyStudent.id,
                    historyStudent.fullName,
                    historyStudent.studentLoginId,
                    next
                  );
                }}
              >
                <option value="">All levels</option>
                {subjectLevels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {historyLoading ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : null}
          <table className="mt-3 min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="pr-3 py-1 font-medium">Date</th>
                <th className="py-1 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {historyItems.length === 0 && !historyLoading ? (
                <tr>
                  <td colSpan={2} className="py-2 text-slate-500">
                    No earlier records.
                  </td>
                </tr>
              ) : (
                historyItems.map((item, idx) => {
                  const prev = historyItems.slice(idx + 1).find((older) =>
                    kind === "MARKS" ? older.testedLevelId === item.testedLevelId : true
                  );
                  let change = "";
                  if (!item.absent && prev && !prev.absent) {
                    if (kind === "ORAL" && item.judgedLevelOrder != null && prev.judgedLevelOrder != null) {
                      if (item.judgedLevelOrder > prev.judgedLevelOrder) change = " · Up";
                      else if (item.judgedLevelOrder < prev.judgedLevelOrder) change = " · Down";
                      else change = " · Same";
                    }
                    if (kind === "MARKS" && item.percentage != null && prev.percentage != null) {
                      if (item.percentage > prev.percentage) change = " · Up";
                      else if (item.percentage < prev.percentage) change = " · Down";
                      else change = " · Same";
                    }
                  }
                  const levelLabel =
                    kind === "MARKS" && !historyLevelId && item.testedLevelName
                      ? `${item.testedLevelName} · `
                      : "";
                  return (
                    <tr key={item.entryId} className="border-t border-slate-100">
                      <td className="pr-3 py-1.5 whitespace-nowrap">{item.date}</td>
                      <td className="py-1.5">
                        {item.absent
                          ? `${levelLabel}Abs`
                          : kind === "ORAL"
                            ? item.judgedLevelOrder != null
                              ? `L${item.judgedLevelOrder}${
                                  item.judgedLevelName ? ` · ${item.judgedLevelName}` : ""
                                }${change}`
                              : "—"
                            : item.score != null && item.maxScore != null
                              ? `${levelLabel}${item.score}/${item.maxScore}${
                                  item.percentage != null ? ` (${item.percentage.toFixed(0)}%)` : ""
                                }${change}`
                              : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "mark" && !loading && rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Select class, section, and subject to load students.</p>
      ) : null}
    </AppShell>
  );
}
