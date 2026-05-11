import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api, getToken } from "../../api";
import { useConfirmDialog } from "../../components/ConfirmDialog";

type ChapterTopicPart = {
  topicId: string;
  weightPct: number;
  sortOrder: number;
  topic: { id: string; name: string };
};

type ChapterRow = {
  id: string;
  name: string;
  order: number;
  topicParticipations: ChapterTopicPart[];
  _count: { questions: number };
};

type SyllabusSubjectRow = {
  id: string;
  name: string;
  code: string | null;
  schoolClass: { id: string; name: string; grade: string | null };
  chapters: ChapterRow[];
};

type ClassRow = { id: string; name: string; grade: string | null };

type Difficulty = "EASY" | "MEDIUM" | "HARD";

type QuestionRow = {
  id: string;
  chapterId: string;
  topicId: string;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  difficulty: Difficulty;
};

type ImportResult = {
  batchId: string;
  mode: "insert" | "sync" | "replace";
  imported: number;
  updated: number;
  skipped: number;
  parseCount: number;
  errors: string[];
};

type ParsedQuestionPreview = {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
};

type DryRunResult = {
  dryRun: true;
  parseCount: number;
  questions: ParsedQuestionPreview[];
};

export function SyllabusQuestionBankPage() {
  const [subjects, setSubjects] = useState<SyllabusSubjectRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "">("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const confirmDialog = useConfirmDialog();
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const [form, setForm] = useState({
    stem: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    correctOption: "0",
    difficulty: "MEDIUM" as Difficulty,
    editId: "",
  });

  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"insert" | "sync" | "replace">("insert");
  const [importDifficulty, setImportDifficulty] = useState<Difficulty>("MEDIUM");
  const [autoCreateMissing, setAutoCreateMissing] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [pasteDifficulty, setPasteDifficulty] = useState<Difficulty>("MEDIUM");
  const [pastePreview, setPastePreview] = useState<ParsedQuestionPreview[] | null>(null);
  const [pasteUnparsed, setPasteUnparsed] = useState(0);

  const formRef = useRef<HTMLDivElement | null>(null);
  const stemRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  const visibleSubjects = useMemo(() => {
    if (!classId) return subjects;
    return subjects.filter((s) => s.schoolClass.id === classId);
  }, [subjects, classId]);

  const selectedSubject = useMemo(
    () => visibleSubjects.find((s) => s.id === subjectId) ?? null,
    [visibleSubjects, subjectId]
  );
  const selectedChapter = useMemo(
    () => selectedSubject?.chapters.find((c) => c.id === chapterId) ?? null,
    [selectedSubject, chapterId]
  );
  const topicOptions = selectedChapter?.topicParticipations ?? [];

  // Per-topic question count for the topic tile grid. We compute it from
  // the loaded `questions` list which is scoped to the selected chapter
  // (NOT topic) so all topics in this chapter contribute counts.
  const questionsByTopic = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of questions) m.set(q.topicId, (m.get(q.topicId) ?? 0) + 1);
    return m;
  }, [questions]);

  // The list rendered in the "Questions in this chapter" panel. When the
  // user has also picked a topic, narrow it client-side so the topic tile
  // counts don't disappear.
  const displayedQuestions = useMemo(() => {
    if (!topicId) return questions;
    return questions.filter((q) => q.topicId === topicId);
  }, [questions, topicId]);

  useEffect(() => {
    if (!selectedSubject) {
      setChapterId("");
      setTopicId("");
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (!selectedChapter) setTopicId("");
    else if (!selectedChapter.topicParticipations.some((tp) => tp.topicId === topicId))
      setTopicId("");
  }, [selectedChapter, topicId]);

  useEffect(() => {
    if (!chapterId) {
      setQuestions([]);
      return;
    }
    void loadQuestions();
  }, [chapterId, difficultyFilter]);

  async function refresh() {
    const [s, c] = await Promise.all([
      api<SyllabusSubjectRow[]>("/api/v1/admin/syllabus/subjects"),
      api<ClassRow[]>("/api/v1/admin/classes"),
    ]);
    if (!s.ok) setErr(s.error ?? "Failed to load subjects");
    else setSubjects(s.data ?? []);
    if (!c.ok) setErr(c.error ?? "Failed to load classes");
    else setClasses(c.data ?? []);
  }

  async function loadQuestions() {
    // Always load chapter-scoped (not topic-scoped) so the topic tile
    // counts stay accurate regardless of which topic is picked.
    const q = new URLSearchParams();
    if (chapterId) q.set("chapterId", chapterId);
    if (difficultyFilter) q.set("difficulty", difficultyFilter);
    const r = await api<QuestionRow[]>(`/api/v1/admin/syllabus/questions?${q.toString()}`);
    if (!r.ok) setErr(r.error ?? "Failed to load questions");
    else setQuestions(r.data ?? []);
  }

  function resetForm() {
    setForm({
      stem: "",
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      correctOption: "0",
      difficulty: "MEDIUM",
      editId: "",
    });
  }

  async function saveQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!chapterId || !topicId) return;
    setBusy(true);
    setErr(null);
    const payload = {
      chapterId,
      topicId,
      stem: form.stem.trim(),
      optionA: form.optionA.trim(),
      optionB: form.optionB.trim(),
      optionC: form.optionC.trim(),
      optionD: form.optionD.trim(),
      correctOption: parseInt(form.correctOption, 10),
      difficulty: form.difficulty,
    };
    const r = form.editId
      ? await api(`/api/v1/admin/syllabus/questions/${form.editId}`, {
          method: "PATCH",
          json: {
            stem: payload.stem,
            optionA: payload.optionA,
            optionB: payload.optionB,
            optionC: payload.optionC,
            optionD: payload.optionD,
            correctOption: payload.correctOption,
            difficulty: payload.difficulty,
          },
        })
      : await api("/api/v1/admin/syllabus/questions", { method: "POST", json: payload });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Save failed");
      return;
    }
    resetForm();
    await loadQuestions();
    await refresh();
  }

  function startEdit(q: QuestionRow) {
    setForm({
      stem: q.stem,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: String(q.correctOption),
      difficulty: q.difficulty,
      editId: q.id,
    });
    setErr(null);
    setImportMsg(null);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      stemRef.current?.focus();
    });
  }

  function removeQuestion(id: string, stem: string) {
    const preview = stem.length > 200 ? `${stem.slice(0, 200)}…` : stem;
    confirmDialog.setRequest({
      title: "Delete question",
      message: `This will permanently delete the question shown below. This cannot be undone.\n\n"${preview}"`,
      confirmLabel: "Delete question",
      onConfirm: () => doRemoveQuestion(id),
    });
  }

  async function doRemoveQuestion(id: string) {
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/syllabus/questions/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Delete failed");
    else {
      await loadQuestions();
      await refresh();
    }
  }

  async function previewPaste() {
    if (!pasteText.trim() || !chapterId || !topicId) return;
    setBusy(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const r = await api<DryRunResult>("/api/v1/admin/syllabus/questions/import-text", {
      method: "POST",
      json: { chapterId, topicId, text: pasteText, dryRun: true },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not parse pasted text");
      setPastePreview(null);
      return;
    }
    const blockCount = (pasteText.replace(/\r\n/g, "\n").trim().split(/\n\s*\n+/) || []).filter(
      (b) => b.trim()
    ).length;
    setPastePreview(r.data.questions);
    setPasteUnparsed(Math.max(0, blockCount - r.data.questions.length));
  }

  async function importPaste() {
    if (!pasteText.trim() || !chapterId || !topicId) return;
    setBusy(true);
    setImporting(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const r = await api<ImportResult>("/api/v1/admin/syllabus/questions/import-text", {
      method: "POST",
      json: {
        chapterId,
        topicId,
        text: pasteText,
        mode: importMode,
        difficulty: pasteDifficulty,
      },
    });
    setBusy(false);
    setImporting(false);
    if (!r.ok) {
      setErr(r.error ?? "Paste import failed");
      return;
    }
    const result = r.data;
    if (result) {
      setImportMsg(
        `Paste import completed. Mode ${result.mode}: imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped} (parsed ${result.parseCount}).`
      );
      if (result.errors?.length) setImportErrors(result.errors);
    }
    setPasteText("");
    setPastePreview(null);
    setPasteUnparsed(0);
    await loadQuestions();
    await refresh();
  }

  async function importDocx(e: React.FormEvent) {
    e.preventDefault();
    if (!docxFile || !chapterId || !topicId) return;
    setBusy(true);
    setImporting(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const fd = new FormData();
    fd.set("file", docxFile);
    fd.set("chapterId", chapterId);
    fd.set("topicId", topicId);
    fd.set("difficulty", importDifficulty);
    fd.set("mode", importMode);
    try {
      const token = getToken();
      const base = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${base}/api/v1/admin/syllabus/questions/import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as ImportResult | { error?: string }) : null;
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Import failed";
        setErr(msg);
        return;
      }
      const result = data as ImportResult;
      setImportMsg(
        `Word upload completed. Mode ${result.mode}: imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped} (parsed ${result.parseCount}).`
      );
      if (result.errors?.length) setImportErrors(result.errors);
      await loadQuestions();
      await refresh();
    } catch {
      setErr("Upload failed due to network/server error.");
    } finally {
      setBusy(false);
      setImporting(false);
    }
  }

  async function importSheet(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetFile || !subjectId) return;
    setBusy(true);
    setImporting(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const fd = new FormData();
    fd.set("file", sheetFile);
    fd.set("syllabusSubjectId", subjectId);
    if (chapterId) fd.set("chapterId", chapterId);
    if (topicId) fd.set("topicId", topicId);
    fd.set("difficulty", importDifficulty);
    fd.set("mode", importMode);
    fd.set("autoCreate", autoCreateMissing ? "1" : "0");
    try {
      const token = getToken();
      const base = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${base}/api/v1/admin/syllabus/questions/import-sheet`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as ImportResult | { error?: string }) : null;
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Sheet import failed";
        setErr(msg);
        return;
      }
      const result = data as ImportResult;
      setImportMsg(
        `Sheet upload completed. Mode ${result.mode}: imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped} (parsed ${result.parseCount}).`
      );
      if (result.errors?.length) setImportErrors(result.errors);
      // Refresh first so any newly auto-created chapters/topics show up in
      // the dropdowns and counts before we re-list questions.
      await refresh();
      await loadQuestions();
      setSheetFile(null);
    } catch {
      setErr("Sheet upload failed due to network/server error.");
    } finally {
      setBusy(false);
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const rows = [
      ["question", "optionA", "optionB", "optionC", "optionD", "answer", "chapter", "topic", "difficulty"],
      [
        "A car accelerates from rest at 4 m/s² for 5 s. Final velocity?",
        "10 m/s",
        "15 m/s",
        "20 m/s",
        "25 m/s",
        "C",
        "Kinematics",
        "Acceleration",
        "MEDIUM",
      ],
      [
        "Projectile is thrown at 30°. Range is maximum at angle:",
        "30°",
        "45°",
        "60°",
        "90°",
        "B",
        "Kinematics",
        "Projectile motion",
        "EASY",
      ],
      [
        "Newton's third law states that for every action there is an equal and opposite:",
        "Force",
        "Reaction",
        "Velocity",
        "Mass",
        "B",
        "Laws of motion",
        "Newton's laws",
        "EASY",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "syllabus_question_template.xlsx");
  }

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Syllabus question bank</h1>
        <span className="text-xs rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 font-medium">
          Model 2 · separate from skill questions
        </span>
      </div>
      <p className="mt-1 text-slate-600">
        Pick a syllabus subject, chapter, and topic, then paste / upload / type questions tagged Easy / Medium / Hard.
        Students will draw from this pool when picking that chapter.
      </p>
      {err && <p className="mt-3 text-rose-700">{err}</p>}
      {importMsg && <p className="mt-3 text-emerald-700">{importMsg}</p>}
      {importing && <p className="mt-2 text-indigo-700">Uploading question bank…</p>}
      {importErrors.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Some rows could not be imported:</p>
          <ul className="mt-1 list-disc list-inside text-xs text-amber-900">
            {importErrors.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            <span className="block text-slate-700 mb-1">Class</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSubjectId("");
              }}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-700 mb-1">Subject</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Select subject…</option>
              {visibleSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.schoolClass.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-700 mb-1">Chapter</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={chapterId}
              onChange={(e) => setChapterId(e.target.value)}
              disabled={!selectedSubject}
            >
              <option value="">Select chapter…</option>
              {(selectedSubject?.chapters ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-700 mb-1">Topic</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={!selectedChapter}
            >
              <option value="">Select topic…</option>
              {topicOptions.map((tp) => (
                <option key={tp.topicId} value={tp.topicId}>
                  {tp.topic.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>Filter difficulty:</span>
          {(["", "EASY", "MEDIUM", "HARD"] as const).map((d) => (
            <button
              key={d || "all"}
              type="button"
              onClick={() => setDifficultyFilter(d as Difficulty | "")}
              className={`rounded-full px-3 py-1 border ${
                difficultyFilter === d
                  ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {d || "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Excel / CSV upload — works as soon as a subject is picked because
          rows can carry their own chapter + topic. */}
      {subjectId && (
        <form
          onSubmit={importSheet}
          className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-900">Upload Excel / CSV (multi-chapter)</p>
            <span className="text-xs text-slate-500">
              One file → many chapters &amp; topics
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Columns: <span className="font-mono">question, optionA-D, answer (A/B/C/D), chapter, topic, difficulty</span>.
            <br />
            Each row's <span className="font-mono">chapter</span> and <span className="font-mono">topic</span>
            {" "}decide where it lands. Leave them empty to fall back to whichever chapter / topic you've selected above.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="block text-sm"
              onChange={(e) => setSheetFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-lg border border-slate-300 bg-white text-slate-700 px-3 py-2 text-sm"
            >
              Template
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-sm">
              <span className="text-slate-700 mr-2">Default difficulty</span>
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={importDifficulty}
                onChange={(e) => setImportDifficulty(e.target.value as Difficulty)}
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-700 mr-2">Mode</span>
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as "insert" | "sync" | "replace")}
              >
                <option value="insert">Insert (skip duplicates)</option>
                <option value="sync">Sync (update by question text)</option>
                <option value="replace">Replace existing in affected chapters/topics</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoCreateMissing}
                onChange={(e) => setAutoCreateMissing(e.target.checked)}
              />
              Auto-create missing chapters / topics
            </label>
            <button
              type="submit"
              disabled={busy || !sheetFile}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {importing ? "Uploading…" : "Upload Excel/CSV"}
            </button>
          </div>
          {(!chapterId || !topicId) && (
            <p className="mt-2 text-xs text-slate-500">
              {!chapterId
                ? "No fallback chapter selected — every row must include a chapter column."
                : "No fallback topic selected — every row must include a topic column."}
            </p>
          )}
        </form>
      )}

      {/* Chapter tiles — clickable list, mirrors the skill side. */}
      {selectedSubject && selectedSubject.chapters.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="font-semibold text-slate-900">Chapters in {selectedSubject.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            Click a chapter to see its question bank. Click a topic to narrow the list further.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {selectedSubject.chapters.map((c) => {
              const count = c._count?.questions ?? 0;
              const empty = count === 0;
              const active = chapterId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setChapterId(c.id);
                    setTopicId("");
                  }}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left ${
                    active
                      ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300"
                      : empty
                      ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
                      : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                  }`}
                >
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <span className={`text-xs ${empty ? "text-amber-800" : "text-emerald-800"}`}>
                    {count} question{count === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Topic tiles for the selected chapter. */}
      {selectedChapter && topicOptions.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="font-semibold text-slate-900">
            Topics in {selectedChapter.name}
            {topicId ? (
              <button
                type="button"
                onClick={() => setTopicId("")}
                className="ml-3 text-xs font-normal text-indigo-700 underline"
              >
                Show all topics
              </button>
            ) : null}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {topicOptions.map((tp) => {
              const count = questionsByTopic.get(tp.topicId) ?? 0;
              const empty = count === 0;
              const active = topicId === tp.topicId;
              return (
                <button
                  key={tp.topicId}
                  type="button"
                  onClick={() => setTopicId(tp.topicId)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left ${
                    active
                      ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300"
                      : empty
                      ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
                      : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                  }`}
                >
                  <span className="font-medium text-slate-900">{tp.topic.name}</span>
                  <span className={`text-xs ${empty ? "text-amber-800" : "text-emerald-800"}`}>
                    {count} question{count === 1 ? "" : "s"}
                    {tp.weightPct > 0 ? ` · ${tp.weightPct}% weight` : ""}
                  </span>
                </button>
              );
            })}
          </div>
          {questions.length >= 200 && (
            <p className="mt-2 text-xs text-amber-700">
              Showing the most recent 200 questions in this chapter — counts here may under-count older topics.
            </p>
          )}
        </div>
      )}

      {/* Question list — visible whenever a chapter is picked, narrowed
          by topic if one is also picked. */}
      {chapterId && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="font-semibold text-slate-900">
            {topicId
              ? `Questions in ${selectedChapter?.name ?? "chapter"} · ${
                  topicOptions.find((tp) => tp.topicId === topicId)?.topic.name ?? "topic"
                }`
              : `All questions in ${selectedChapter?.name ?? "chapter"}`}
            {difficultyFilter ? ` (${difficultyFilter})` : ""}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {displayedQuestions.length} shown
            </span>
          </p>
          {displayedQuestions.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No questions yet. Use Excel upload above, or pick a topic to use the paste / Word / manual flows below.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {displayedQuestions.map((q) => {
                const labels = ["A", "B", "C", "D"];
                const topicName =
                  topicOptions.find((tp) => tp.topicId === q.topicId)?.topic.name ?? "topic";
                return (
                  <li key={q.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap">
                        {q.stem}
                      </p>
                      <div className="flex items-center gap-2">
                        {!topicId && (
                          <span className="text-xs rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5">
                            {topicName}
                          </span>
                        )}
                        <span className="text-xs rounded-full bg-slate-200 text-slate-700 px-2 py-0.5">
                          {q.difficulty}
                        </span>
                      </div>
                    </div>
                    <ul className="mt-1 grid gap-1 sm:grid-cols-2 text-xs text-slate-700">
                      {[q.optionA, q.optionB, q.optionC, q.optionD].map((opt, i) => (
                        <li
                          key={i}
                          className={
                            i === q.correctOption ? "text-emerald-800 font-medium" : ""
                          }
                        >
                          {labels[i]}. {opt}
                          {i === q.correctOption ? " ✓" : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => startEdit(q)}
                        className="rounded border border-indigo-300 bg-white text-indigo-700 px-2 py-1"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuestion(q.id, q.stem)}
                        className="rounded border border-rose-300 bg-white text-rose-700 px-2 py-1"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {chapterId && topicId ? (
        <>
          {/* Paste panel */}
          <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Paste questions (fastest)</h2>
              <span className="text-xs text-slate-500">
                English / Hindi / mixed math — Unicode preserved
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Paste any number of MCQs separated by a blank line. Same parser as the skill question bank.
              Difficulty selected here is applied to every question in this paste.
            </p>
            <textarea
              className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono min-h-[200px]"
              placeholder={`Q1. A car accelerates from rest at 4 m/s² for 5 s. Final velocity?\nA) 10 m/s\nB) 15 m/s\nC) 20 m/s\nD) 25 m/s\nAnswer: C`}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                if (pastePreview) {
                  setPastePreview(null);
                  setPasteUnparsed(0);
                }
              }}
              disabled={busy}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="text-sm">
                <span className="text-slate-700 mr-2">Difficulty</span>
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={pasteDifficulty}
                  onChange={(e) => setPasteDifficulty(e.target.value as Difficulty)}
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-700 mr-2">Mode</span>
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={importMode}
                  onChange={(e) =>
                    setImportMode(e.target.value as "insert" | "sync" | "replace")
                  }
                >
                  <option value="insert">Insert (skip duplicates)</option>
                  <option value="sync">Sync (update by stem)</option>
                  <option value="replace">Replace topic</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void previewPaste()}
                disabled={busy || !pasteText.trim()}
                className="rounded-lg border border-indigo-300 bg-white text-indigo-700 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => void importPaste()}
                disabled={busy || !pasteText.trim()}
                className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Save to bank
              </button>
            </div>
            {pastePreview && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm">
                  Preview parsed <strong>{pastePreview.length}</strong> question
                  {pastePreview.length === 1 ? "" : "s"}.{" "}
                  {pasteUnparsed > 0
                    ? `${pasteUnparsed} block${pasteUnparsed === 1 ? "" : "s"} could not be parsed.`
                    : "All blocks parsed."}
                </p>
                <ol className="mt-2 list-decimal list-inside space-y-1 text-xs text-slate-700 max-h-64 overflow-auto">
                  {pastePreview.slice(0, 20).map((q, i) => (
                    <li key={i}>
                      {q.stem.slice(0, 110)}
                      {q.stem.length > 110 ? "…" : ""}{" "}
                      <span className="text-slate-500">
                        ({["A", "B", "C", "D"][q.correctOption] ?? "?"})
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Word upload (single chapter+topic) */}
          <div className="mt-4">
            <form
              onSubmit={importDocx}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="font-semibold text-slate-900">Upload Word (.docx)</p>
              <p className="mt-1 text-xs text-slate-500">
                Same parser as skill side. Difficulty here applies to all parsed questions in the file.
              </p>
              <input
                type="file"
                accept=".docx"
                className="mt-2 block w-full text-sm"
                onChange={(e) => setDocxFile(e.target.files?.[0] ?? null)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={importDifficulty}
                  onChange={(e) => setImportDifficulty(e.target.value as Difficulty)}
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
                <button
                  type="submit"
                  disabled={busy || !docxFile}
                  className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Upload
                </button>
              </div>
            </form>
          </div>

          {/* Manual form */}
          <div
            ref={formRef}
            className={`mt-4 rounded-xl border bg-white p-4 shadow-sm ${
              form.editId ? "border-amber-400 ring-1 ring-amber-200 bg-amber-50/40" : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-slate-900">
                {form.editId ? "Editing existing question" : "Add a single question"}
              </p>
              {form.editId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs rounded border border-slate-300 bg-white px-2 py-1"
                >
                  Cancel edit
                </button>
              )}
            </div>
            <form onSubmit={saveQuestion} className="mt-3 space-y-2">
              <textarea
                ref={stemRef}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm min-h-[80px]"
                placeholder="Question stem"
                value={form.stem}
                onChange={(e) => setForm((f) => ({ ...f, stem: e.target.value }))}
                required
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {(["optionA", "optionB", "optionC", "optionD"] as const).map((k, i) => (
                  <input
                    key={k}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder={`Option ${["A", "B", "C", "D"][i]}`}
                    value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                    required
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm">
                  <span className="text-slate-700 mr-2">Correct</span>
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={form.correctOption}
                    onChange={(e) => setForm((f) => ({ ...f, correctOption: e.target.value }))}
                  >
                    <option value="0">A</option>
                    <option value="1">B</option>
                    <option value="2">C</option>
                    <option value="3">D</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-slate-700 mr-2">Difficulty</span>
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={form.difficulty}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, difficulty: e.target.value as Difficulty }))
                    }
                  >
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {form.editId ? "Save changes" : "Add question"}
                </button>
              </div>
            </form>
          </div>

        </>
      ) : null}

      {!subjectId && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-600">
          Pick a subject above to see its chapters and to upload questions.
        </div>
      )}
      {confirmDialog.element}
    </>
  );
}
