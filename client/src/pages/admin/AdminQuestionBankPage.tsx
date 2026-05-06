import { useEffect, useMemo, useState } from "react";
import { api, getToken } from "../../api";
import * as XLSX from "xlsx";

type TopicRow = { id: string; name: string; levelId: string | null };
type LevelRow = { id: string; name: string; order: number };
type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  levels: LevelRow[];
  topics: TopicRow[];
  classSubjects?: { schoolClass: { id: string; name: string; grade: string | null } }[];
};
type ClassRow = { id: string; name: string; grade: string | null };
type QuestionRow = {
  id: string;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
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

export function AdminQuestionBankPage() {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [busy, setBusy] = useState(false);
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
    difficulty: "MEDIUM" as "EASY" | "MEDIUM" | "HARD",
    editId: "",
  });
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [syncMode, setSyncMode] = useState(true);
  const [replaceMode, setReplaceMode] = useState(false);
  const [setup, setSetup] = useState({
    subjectName: "",
    subjectCode: "",
    levelName: "",
    questionCount: "8",
    topicName: "",
  });
  const [clone, setClone] = useState({
    sourceClassId: "",
    sourceSubjectId: "",
    targetClassId: "",
    name: "",
    code: "",
  });

  useEffect(() => {
    void refreshSubjects();
    void refreshClasses();
  }, []);

  const visibleSubjects = useMemo(() => {
    if (!classId) return subjects;
    return subjects.filter((s) => (s.classSubjects ?? []).some((cs) => cs.schoolClass.id === classId));
  }, [subjects, classId]);

  const selectedSubject = useMemo(() => visibleSubjects.find((s) => s.id === subjectId) ?? null, [visibleSubjects, subjectId]);
  const sourceSubjects = useMemo(
    () =>
      clone.sourceClassId
        ? subjects.filter((s) => (s.classSubjects ?? []).some((cs) => cs.schoolClass.id === clone.sourceClassId))
        : [],
    [subjects, clone.sourceClassId]
  );
  const levelOptions = selectedSubject?.levels ?? [];
  const topicOptions = useMemo(
    () => (selectedSubject?.topics ?? []).filter((t) => (levelId ? t.levelId === levelId : false)),
    [selectedSubject, levelId]
  );
  const levelNameById = useMemo(
    () => new Map((selectedSubject?.levels ?? []).map((l) => [l.id, l.name])),
    [selectedSubject]
  );

  useEffect(() => {
    if (!selectedSubject || !selectedSubject.levels.some((l) => l.id === levelId)) {
      setLevelId("");
      setTopicId("");
    }
  }, [selectedSubject, levelId]);

  useEffect(() => {
    if (!topicOptions.some((t) => t.id === topicId)) setTopicId("");
  }, [topicOptions, topicId]);

  useEffect(() => {
    if (!topicId) {
      setQuestions([]);
      return;
    }
    void loadQuestions(topicId, subjectId, levelId);
  }, [topicId, subjectId, levelId]);

  async function loadQuestions(currentTopicId: string, currentSubjectId: string, currentLevelId: string) {
    const q = new URLSearchParams();
    q.set("topicId", currentTopicId);
    if (currentSubjectId) q.set("subjectId", currentSubjectId);
    if (currentLevelId) q.set("levelId", currentLevelId);
    const r = await api<QuestionRow[]>(`/api/v1/admin/questions?${q.toString()}`);
    if (!r.ok) setErr(r.error ?? "Failed to load questions");
    else setQuestions(r.data ?? []);
  }

  async function refreshSubjects() {
    const r = await api<SubjectRow[]>("/api/v1/admin/subjects");
    if (!r.ok) setErr(r.error ?? "Failed to load subjects");
    else setSubjects(r.data ?? []);
  }

  async function refreshClasses() {
    const r = await api<ClassRow[]>("/api/v1/admin/classes");
    if (!r.ok) setErr(r.error ?? "Failed to load classes");
    else setClasses(r.data ?? []);
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
    if (!subjectId || !levelId || !topicId) return;
    setBusy(true);
    setErr(null);
    const payload = {
      subjectId,
      levelId,
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
      ? await api(`/api/v1/admin/questions/${form.editId}`, {
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
      : await api("/api/v1/admin/questions", { method: "POST", json: payload });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Save failed");
      return;
    }
    resetForm();
    await loadQuestions(topicId, subjectId, levelId);
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
  }

  async function removeQuestion(id: string) {
    if (!topicId) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/questions/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Delete failed");
    else await loadQuestions(topicId, subjectId, levelId);
  }

  async function importDocx(e: React.FormEvent) {
    e.preventDefault();
    if (!docxFile || !subjectId || !levelId || !topicId) return;
    setBusy(true);
    setImporting(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const fd = new FormData();
    fd.set("file", docxFile);
    fd.set("subjectId", subjectId);
    fd.set("levelId", levelId);
    fd.set("topicId", topicId);
    fd.set("mode", replaceMode ? "replace" : syncMode ? "sync" : "insert");

    try {
      const token = getToken();
      const base = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${base}/api/v1/admin/questions/import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const text = await res.text();
      let data: ImportResult | { error?: string } | null = null;
      try {
        data = text ? (JSON.parse(text) as ImportResult | { error?: string }) : null;
      } catch {
        data = null;
      }
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
        `Upload completed. Mode ${result.mode}: imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped} (parsed ${result.parseCount}).`
      );
      if (result.errors?.length) setImportErrors(result.errors);
      await loadQuestions(topicId, subjectId, levelId);
    } catch {
      setErr("Upload failed due to network/server error. Please try again.");
    } finally {
      setBusy(false);
      setImporting(false);
    }
  }

  async function importSheet(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetFile || !subjectId || !levelId || !topicId) return;
    setBusy(true);
    setImporting(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const fd = new FormData();
    fd.set("file", sheetFile);
    fd.set("subjectId", subjectId);
    fd.set("levelId", levelId);
    fd.set("topicId", topicId);
    fd.set("mode", replaceMode ? "replace" : syncMode ? "sync" : "insert");
    try {
      const token = getToken();
      const base = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${base}/api/v1/admin/questions/import-sheet`, {
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
      await loadQuestions(topicId, subjectId, levelId);
    } catch {
      setErr("Sheet upload failed due to network/server error. Please try again.");
    } finally {
      setBusy(false);
      setImporting(false);
    }
  }

  function downloadQuestionTemplate() {
    const rows = [
      ["question", "optionA", "optionB", "optionC", "optionD", "answer", "difficulty"],
      [
        "Find the distance between (2,3) and (6,6).",
        "3",
        "4",
        "5",
        "6",
        "C",
        "MEDIUM",
      ],
      [
        "The distance between (0,0) and (8,15) is:",
        "15",
        "16",
        "17",
        "18",
        "C",
        "EASY",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "question_bank_template.xlsx");
  }

  async function addSubjectQuick(e: React.FormEvent) {
    e.preventDefault();
    const name = setup.subjectName.trim();
    if (!name) return;
    if (!classId) {
      setErr("Select class first (Class dropdown in Question Bank filters).");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await api<{ id: string }>(`/api/v1/admin/classes/${classId}/subjects/create`, {
      method: "POST",
      json: { name, code: setup.subjectCode.trim() || undefined },
    });
    setBusy(false);
    if (!r.ok || !r.data?.id) {
      setErr(r.error ?? "Could not create subject");
      return;
    }
    await refreshSubjects();
    setSubjectId(r.data.id);
    setLevelId("");
    setTopicId("");
    setSetup((s) => ({ ...s, subjectName: "", subjectCode: "" }));
  }

  async function addLevelQuick(e: React.FormEvent) {
    e.preventDefault();
    const name = setup.levelName.trim();
    const count = parseInt(setup.questionCount, 10);
    if (!subjectId || !name) return;
    if (!Number.isFinite(count) || count < 1) {
      setErr("Question count must be a positive number");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await api<{ id: string }>(`/api/v1/admin/subjects/${subjectId}/levels`, {
      method: "POST",
      json: { name, questionCount: count },
    });
    setBusy(false);
    if (!r.ok || !r.data?.id) {
      setErr(r.error ?? "Could not create level");
      return;
    }
    await refreshSubjects();
    setLevelId(r.data.id);
    setTopicId("");
    setSetup((s) => ({ ...s, levelName: "" }));
  }

  async function addTopicQuick(e: React.FormEvent) {
    e.preventDefault();
    const name = setup.topicName.trim();
    if (!subjectId || !levelId || !name) return;
    setBusy(true);
    setErr(null);
    const r = await api<{ id: string }>(`/api/v1/admin/subjects/${subjectId}/topics`, {
      method: "POST",
      json: { name, levelId },
    });
    setBusy(false);
    if (!r.ok || !r.data?.id) {
      setErr(r.error ?? "Could not create topic");
      return;
    }
    await refreshSubjects();
    setTopicId(r.data.id);
    setSetup((s) => ({ ...s, topicName: "" }));
  }

  async function cloneSubjectStructure(e: React.FormEvent) {
    e.preventDefault();
    if (!clone.sourceClassId || !clone.sourceSubjectId || !clone.targetClassId) return;
    setBusy(true);
    setErr(null);
    const r = await api<{ id: string }>(`/api/v1/admin/classes/${clone.targetClassId}/subjects/${clone.sourceSubjectId}/clone`, {
      method: "POST",
      json: {
        name: clone.name.trim() || undefined,
        code: clone.code.trim() || undefined,
      },
    });
    setBusy(false);
    if (!r.ok || !r.data?.id) {
      setErr(r.error ?? "Clone failed");
      return;
    }
    await refreshSubjects();
    setClassId(clone.targetClassId);
    setSubjectId(r.data.id);
    setLevelId("");
    setTopicId("");
    setClone((c) => ({ ...c, sourceSubjectId: "", name: "", code: "" }));
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Question bank</h1>
      <p className="mt-1 text-slate-600">Create level tests directly: select subject, level, and topic, then manage questions.</p>
      {err && <p className="mt-4 text-red-600">{err}</p>}
      {importMsg && <p className="mt-4 text-emerald-700">{importMsg}</p>}
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

      <details className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 open:shadow-sm" open>
        <summary className="cursor-pointer list-none font-semibold text-indigo-900">Best flow setup in one place</summary>
        <p className="mt-1 text-sm text-indigo-900/80">
          1) Create subject, 2) add level with question count, 3) add topic, 4) upload/manage questions below.
        </p>
        <p className="mt-1 text-xs text-indigo-900/70">
          Subject creation here uses the selected class from the Class dropdown below.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <form onSubmit={addSubjectQuick} className="rounded-lg bg-white border border-indigo-100 p-3 space-y-2">
            <p className="text-sm font-medium text-slate-900">Step 1: Add subject</p>
            <input
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Subject name"
              value={setup.subjectName}
              onChange={(e) => setSetup((s) => ({ ...s, subjectName: e.target.value }))}
              disabled={busy}
            />
            <input
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Code (optional)"
              value={setup.subjectCode}
              onChange={(e) => setSetup((s) => ({ ...s, subjectCode: e.target.value }))}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !classId || !setup.subjectName.trim()}
              className="rounded bg-indigo-600 text-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Create subject
            </button>
          </form>

          <form onSubmit={addLevelQuick} className="rounded-lg bg-white border border-indigo-100 p-3 space-y-2">
            <p className="text-sm font-medium text-slate-900">Step 2: Add level + questions</p>
            <input
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Level name"
              value={setup.levelName}
              onChange={(e) => setSetup((s) => ({ ...s, levelName: e.target.value }))}
              disabled={busy || !subjectId}
            />
            <input
              type="number"
              min={1}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Questions per attempt"
              value={setup.questionCount}
              onChange={(e) => setSetup((s) => ({ ...s, questionCount: e.target.value }))}
              disabled={busy || !subjectId}
            />
            <button
              type="submit"
              disabled={busy || !subjectId || !setup.levelName.trim()}
              className="rounded bg-indigo-600 text-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Create level
            </button>
          </form>

          <form onSubmit={addTopicQuick} className="rounded-lg bg-white border border-indigo-100 p-3 space-y-2">
            <p className="text-sm font-medium text-slate-900">Step 3: Add topic</p>
            <input
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Topic name"
              value={setup.topicName}
              onChange={(e) => setSetup((s) => ({ ...s, topicName: e.target.value }))}
              disabled={busy || !subjectId || !levelId}
            />
            <button
              type="submit"
              disabled={busy || !subjectId || !levelId || !setup.topicName.trim()}
              className="rounded bg-indigo-600 text-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Create topic
            </button>
          </form>
        </div>
        <form onSubmit={cloneSubjectStructure} className="mt-4 rounded-lg bg-white border border-indigo-100 p-3">
          <p className="text-sm font-medium text-slate-900">Clone from another class</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Copies subject, levels, question-count config, topics, and chapter mix. Questions are not copied.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={clone.sourceClassId}
              onChange={(e) =>
                setClone((c) => ({ ...c, sourceClassId: e.target.value, sourceSubjectId: "" }))
              }
              disabled={busy}
            >
              <option value="">Source class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.grade ? ` (Grade ${c.grade})` : ""}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={clone.sourceSubjectId}
              onChange={(e) => setClone((c) => ({ ...c, sourceSubjectId: e.target.value }))}
              disabled={busy || !clone.sourceClassId}
            >
              <option value="">Source subject</option>
              {sourceSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.name} (${s.code})` : s.name}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={clone.targetClassId}
              onChange={(e) => setClone((c) => ({ ...c, targetClassId: e.target.value }))}
              disabled={busy}
            >
              <option value="">Target class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.grade ? ` (Grade ${c.grade})` : ""}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="New subject name (optional)"
              value={clone.name}
              onChange={(e) => setClone((c) => ({ ...c, name: e.target.value }))}
              disabled={busy}
            />
            <input
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="New code (optional)"
              value={clone.code}
              onChange={(e) => setClone((c) => ({ ...c, code: e.target.value }))}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !clone.sourceClassId || !clone.sourceSubjectId || !clone.targetClassId}
              className="rounded bg-indigo-700 text-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Clone structure
            </button>
          </div>
        </form>
      </details>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            <span className="text-slate-600">Class</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSubjectId("");
                setLevelId("");
                setTopicId("");
              }}
              disabled={busy}
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.grade ? ` (Grade ${c.grade})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Subject</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={busy}
            >
              <option value="">Select subject</option>
              {visibleSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.name} (${s.code})` : s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Level</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
              disabled={busy || !subjectId}
            >
              <option value="">Select level</option>
              {levelOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Topic</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={busy || !levelId}
            >
              <option value="">Select topic</option>
              {topicOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.levelId ? ` (${levelNameById.get(t.levelId) ?? "Level"})` : ""}
                  {` [${t.id.slice(-4)}]`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{form.editId ? "Edit question" : "Add question"}</h2>
          <form onSubmit={saveQuestion} className="mt-3 space-y-2">
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[88px]"
              placeholder="Question statement"
              value={form.stem}
              onChange={(e) => setForm((x) => ({ ...x, stem: e.target.value }))}
              disabled={busy}
            />
            {(["optionA", "optionB", "optionC", "optionD"] as const).map((k, idx) => (
              <input
                key={k}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                value={form[k]}
                onChange={(e) => setForm((x) => ({ ...x, [k]: e.target.value }))}
                disabled={busy}
              />
            ))}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                Correct option
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                  value={form.correctOption}
                  onChange={(e) => setForm((x) => ({ ...x, correctOption: e.target.value }))}
                  disabled={busy}
                >
                  <option value="0">A</option>
                  <option value="1">B</option>
                  <option value="2">C</option>
                  <option value="3">D</option>
                </select>
              </label>
              <label className="text-sm">
                Difficulty
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                  value={form.difficulty}
                  onChange={(e) =>
                    setForm((x) => ({ ...x, difficulty: e.target.value as "EASY" | "MEDIUM" | "HARD" }))
                  }
                  disabled={busy}
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={busy || !subjectId || !levelId || !topicId || !form.stem.trim()}
                className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {form.editId ? "Update question" : "Add question"}
              </button>
              {form.editId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Import from Excel / CSV</h2>
          <p className="text-xs text-slate-500 mt-1">
            Recommended format columns: question, optionA, optionB, optionC, optionD, answer (A/B/C/D), difficulty (optional).
          </p>
          <button
            type="button"
            onClick={downloadQuestionTemplate}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            Download sample template (Excel)
          </button>
          <form onSubmit={importSheet} className="mt-3 space-y-3">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setSheetFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="block text-sm"
            />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={syncMode} onChange={(e) => setSyncMode(e.target.checked)} />
              Auto-update existing questions (best mode)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={replaceMode}
                onChange={(e) => setReplaceMode(e.target.checked)}
                disabled={!topicId}
              />
              Replace all questions for selected topic
            </label>
            <button
              type="submit"
              disabled={busy || !sheetFile || !subjectId || !levelId || !topicId}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {importing ? "Uploading..." : "Upload Excel/CSV"}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Import from Word (.docx)</h2>
          <p className="text-xs text-slate-500 mt-1">
            Sync updates matching questions in this topic by stem. Replace clears this topic bank first, then imports.
          </p>
          <form onSubmit={importDocx} className="mt-3 space-y-3">
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setDocxFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="block text-sm"
            />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={syncMode} onChange={(e) => setSyncMode(e.target.checked)} />
              Auto-update existing questions (best mode)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={replaceMode}
                onChange={(e) => setReplaceMode(e.target.checked)}
                disabled={!topicId}
              />
              Replace all questions for selected topic
            </label>
            <button
              type="submit"
              disabled={busy || !docxFile || !subjectId || !levelId || !topicId}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {importing ? "Uploading..." : "Upload question bank"}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Questions in selected topic</h2>
        {!topicId ? (
          <p className="mt-2 text-sm text-slate-500">Select subject, level, and topic first.</p>
        ) : questions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No questions yet for this topic.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {questions.map((q, i) => (
              <li key={q.id} className="py-3">
                <p className="text-sm text-slate-900">
                  {i + 1}. {q.stem}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Correct: {String.fromCharCode(65 + q.correctOption)} | Difficulty: {q.difficulty}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(q)}
                    disabled={busy}
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeQuestion(q.id)}
                    disabled={busy}
                    className="rounded border border-rose-300 text-rose-700 px-2 py-1 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
