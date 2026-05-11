import { useEffect, useMemo, useRef, useState } from "react";
import { api, getToken } from "../../api";
import * as XLSX from "xlsx";
import { useConfirmDialog } from "../../components/ConfirmDialog";

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
  topicId: string;
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

export function AdminQuestionBankPage() {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [levelQuestions, setLevelQuestions] = useState<QuestionRow[]>([]);
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

  const [pasteText, setPasteText] = useState("");
  const [pasteDifficulty, setPasteDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [pastePreview, setPastePreview] = useState<ParsedQuestionPreview[] | null>(null);
  const [pasteUnparsed, setPasteUnparsed] = useState(0);
  const confirmDialog = useConfirmDialog();

  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicName, setEditingTopicName] = useState("");

  const formRef = useRef<HTMLDivElement | null>(null);
  const stemRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    void refreshSubjects();
    void refreshClasses();
  }, []);

  const visibleSubjects = useMemo(() => {
    if (!classId) return subjects;
    return subjects.filter((s) => (s.classSubjects ?? []).some((cs) => cs.schoolClass.id === classId));
  }, [subjects, classId]);

  const selectedSubject = useMemo(() => visibleSubjects.find((s) => s.id === subjectId) ?? null, [visibleSubjects, subjectId]);
  const levelOptions = selectedSubject?.levels ?? [];
  const topicOptions = useMemo(
    () => (selectedSubject?.topics ?? []).filter((t) => (levelId ? t.levelId === levelId : false)),
    [selectedSubject, levelId]
  );
  const levelNameById = useMemo(
    () => new Map((selectedSubject?.levels ?? []).map((l) => [l.id, l.name])),
    [selectedSubject]
  );
  const topicQuestionCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of levelQuestions) map.set(q.topicId, (map.get(q.topicId) ?? 0) + 1);
    return map;
  }, [levelQuestions]);

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

  useEffect(() => {
    if (!subjectId || !levelId) {
      setLevelQuestions([]);
      return;
    }
    void loadLevelQuestionStatus(subjectId, levelId);
  }, [subjectId, levelId]);

  async function loadQuestions(currentTopicId: string, currentSubjectId: string, currentLevelId: string) {
    const q = new URLSearchParams();
    q.set("topicId", currentTopicId);
    if (currentSubjectId) q.set("subjectId", currentSubjectId);
    if (currentLevelId) q.set("levelId", currentLevelId);
    const r = await api<QuestionRow[]>(`/api/v1/admin/questions?${q.toString()}`);
    if (!r.ok) setErr(r.error ?? "Failed to load questions");
    else setQuestions(r.data ?? []);
  }

  async function loadLevelQuestionStatus(currentSubjectId: string, currentLevelId: string) {
    const q = new URLSearchParams();
    q.set("subjectId", currentSubjectId);
    q.set("levelId", currentLevelId);
    const r = await api<QuestionRow[]>(`/api/v1/admin/questions?${q.toString()}`);
    if (!r.ok) setErr(r.error ?? "Failed to load topic question status");
    else setLevelQuestions(r.data ?? []);
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
    setErr(null);
    setImportMsg(null);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      stemRef.current?.focus();
    });
  }

  function removeQuestion(id: string, stem: string) {
    if (!topicId) return;
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
      if (subjectId && levelId) await loadLevelQuestionStatus(subjectId, levelId);
    } catch {
      setErr("Sheet upload failed due to network/server error. Please try again.");
    } finally {
      setBusy(false);
      setImporting(false);
    }
  }

  function startEditTopic(t: TopicRow) {
    setEditingTopicId(t.id);
    setEditingTopicName(t.name);
  }

  function cancelEditTopic() {
    setEditingTopicId(null);
    setEditingTopicName("");
  }

  async function saveTopicRename(topicIdToRename: string) {
    const next = editingTopicName.trim();
    if (!next) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/topics/${topicIdToRename}`, {
      method: "PATCH",
      json: { name: next },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not rename chapter");
      return;
    }
    cancelEditTopic();
    await refreshSubjects();
  }

  function removeTopic(t: TopicRow) {
    confirmDialog.setRequest({
      title: "Delete chapter permanently",
      message: `This will permanently delete chapter "${t.name}" and all its questions. This cannot be undone.`,
      requireTypedText: t.name,
      confirmLabel: "Delete chapter",
      onConfirm: () => doRemoveTopic(t),
    });
  }

  async function doRemoveTopic(t: TopicRow) {
    setBusy(true);
    setErr(null);
    // The user already typed the chapter name to confirm; if the soft delete
    // hits a foreign-key wall we go straight to force delete instead of asking
    // a second time.
    let r = await api(`/api/v1/admin/topics/${t.id}`, { method: "DELETE" });
    if (!r.ok && r.status === 400 && r.error && /history|usage|force/i.test(r.error)) {
      r = await api(`/api/v1/admin/topics/${t.id}?force=1`, { method: "DELETE" });
    }
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not delete chapter");
      return;
    }
    if (topicId === t.id) setTopicId("");
    await refreshSubjects();
    if (subjectId && levelId) await loadLevelQuestionStatus(subjectId, levelId);
  }

  async function previewPaste() {
    if (!pasteText.trim() || !subjectId || !levelId || !topicId) return;
    setBusy(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const r = await api<DryRunResult>("/api/v1/admin/questions/import-text", {
      method: "POST",
      json: {
        subjectId,
        levelId,
        topicId,
        text: pasteText,
        dryRun: true,
      },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not parse pasted text");
      setPastePreview(null);
      return;
    }
    const data = r.data;
    if (!data) {
      setErr("Empty preview response");
      setPastePreview(null);
      return;
    }
    const blockCount = (pasteText.replace(/\r\n/g, "\n").trim().split(/\n\s*\n+/) || []).filter((b) => b.trim()).length;
    setPastePreview(data.questions);
    setPasteUnparsed(Math.max(0, blockCount - data.questions.length));
  }

  async function importPaste() {
    if (!pasteText.trim() || !subjectId || !levelId || !topicId) return;
    setBusy(true);
    setImporting(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const r = await api<ImportResult>("/api/v1/admin/questions/import-text", {
      method: "POST",
      json: {
        subjectId,
        levelId,
        topicId,
        text: pasteText,
        mode: replaceMode ? "replace" : syncMode ? "sync" : "insert",
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
    await loadQuestions(topicId, subjectId, levelId);
    if (subjectId && levelId) await loadLevelQuestionStatus(subjectId, levelId);
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

      {subjectId && levelId ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Topic-wise question status</h2>
          <p className="mt-1 text-sm text-slate-600">See coverage instantly and open a topic with one click.</p>
          {topicOptions.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No topics found for selected level.</p>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {topicOptions.map((t) => {
                const count = topicQuestionCount.get(t.id) ?? 0;
                const empty = count === 0;
                const isEditing = editingTopicId === t.id;
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      empty ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    {isEditing ? (
                      <>
                        <input
                          autoFocus
                          className="flex-1 min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                          value={editingTopicName}
                          onChange={(e) => setEditingTopicName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveTopicRename(t.id);
                            else if (e.key === "Escape") cancelEditTopic();
                          }}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          onClick={() => void saveTopicRename(t.id)}
                          disabled={busy || !editingTopicName.trim() || editingTopicName.trim() === t.name}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditTopic}
                          disabled={busy}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setTopicId(t.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <span className="font-medium text-slate-900">{t.name}</span>
                          <span className={`ml-2 ${empty ? "text-amber-800" : "text-emerald-800"}`}>
                            {count} question{count === 1 ? "" : "s"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditTopic(t)}
                          disabled={busy}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                          title="Rename chapter"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTopic(t)}
                          disabled={busy}
                          className="rounded border border-rose-300 bg-white text-rose-700 px-2 py-1 text-xs disabled:opacity-50"
                          title="Delete chapter"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Paste questions (fastest)</h2>
          <span className="text-xs text-slate-500">English / Hindi / mixed math — Unicode preserved</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Paste any number of MCQs separated by a blank line. Stems, options, and answers may be on separate lines or
          options may be on a single line. Recognized labels: <code>Q1.</code> / <code>Question 1.</code> /{" "}
          <code>प्रश्न १.</code> / <code>1.</code>; options <code>A) B) C) D)</code>, <code>(A) (B) (C) (D)</code>, or
          Hindi <code>क/ख/ग/घ</code> / <code>अ/ब/स/द</code>; answers <code>Answer:</code> / <code>Ans:</code> /{" "}
          <code>Correct:</code> / <code>उत्तर:</code> / <code>जवाब:</code>.
        </p>
        <textarea
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono min-h-[200px]"
          placeholder={`Q1. What is 2 + 2?\nA) 3   B) 4   C) 5   D) 6\nAnswer: B\n\nप्रश्न २. भारत की राजधानी क्या है?\nA) मुंबई\nB) कोलकाता\nC) नई दिल्ली\nD) चेन्नई\nउत्तर: C`}
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
          <label className="text-sm text-slate-700">
            Default difficulty
            <select
              className="ml-2 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              value={pasteDifficulty}
              onChange={(e) => setPasteDifficulty(e.target.value as "EASY" | "MEDIUM" | "HARD")}
              disabled={busy}
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void previewPaste()}
            disabled={busy || !pasteText.trim() || !subjectId || !levelId || !topicId}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Preview parse
          </button>
          <button
            type="button"
            onClick={() => void importPaste()}
            disabled={busy || !pasteText.trim() || !subjectId || !levelId || !topicId}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {importing ? "Saving…" : "Save all"}
          </button>
          {(!subjectId || !levelId || !topicId) && (
            <span className="text-xs text-amber-700">Select subject, level, and topic above first.</span>
          )}
        </div>
        {pastePreview ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-900">
              Preview: {pastePreview.length} question{pastePreview.length === 1 ? "" : "s"} parsed
              {pasteUnparsed > 0 && (
                <span className="ml-2 text-amber-700">({pasteUnparsed} block{pasteUnparsed === 1 ? "" : "s"} could not be parsed)</span>
              )}
            </p>
            {pastePreview.length === 0 ? (
              <p className="mt-2 text-sm text-amber-800">
                Nothing parsed. Make sure each question has 4 options and an answer line, separated from the next by a
                blank line.
              </p>
            ) : (
              <ol className="mt-2 space-y-3 text-sm">
                {pastePreview.slice(0, 20).map((q, i) => (
                  <li key={i} className="rounded border border-slate-200 px-3 py-2">
                    <p className="font-medium text-slate-900 whitespace-pre-wrap">
                      {i + 1}. {q.stem}
                    </p>
                    <ul className="mt-1 grid gap-0.5 text-slate-700 sm:grid-cols-2">
                      {[q.optionA, q.optionB, q.optionC, q.optionD].map((opt, idx) => (
                        <li
                          key={idx}
                          className={idx === q.correctOption ? "font-semibold text-emerald-700" : ""}
                        >
                          {String.fromCharCode(65 + idx)}) {opt}
                          {idx === q.correctOption ? "  ✓" : ""}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {pastePreview.length > 20 && (
                  <li className="text-xs text-slate-500">… and {pastePreview.length - 20} more</li>
                )}
              </ol>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div
          ref={formRef}
          className={`rounded-xl border bg-white p-4 shadow-sm transition ${
            form.editId
              ? "border-amber-400 ring-2 ring-amber-200 bg-amber-50/30"
              : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {form.editId ? "Edit question" : "Add question"}
            </h2>
            {form.editId ? (
              <span className="rounded-full bg-amber-100 text-amber-900 text-xs font-medium px-2 py-0.5">
                Editing existing question
              </span>
            ) : null}
          </div>
          <form onSubmit={saveQuestion} className="mt-3 space-y-2">
            <textarea
              ref={stemRef}
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
            Columns: <span className="font-mono">question, optionA-D, answer (A/B/C/D), difficulty</span>.
            All rows go into the selected subject, level, and chapter.
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
                    onClick={() => removeQuestion(q.id, q.stem)}
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
      {confirmDialog.element}
    </>
  );
}
