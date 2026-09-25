import { useEffect, useMemo, useRef, useState } from "react";
import { api, getToken, mediaUrl } from "../../api";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { parseNumericInput, questionTypeLabel, type QuestionType } from "../../questionTypes";

type TopicRow = { id: string; name: string; levelId: string | null };
type LevelRow = { id: string; name: string; order: number };
type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  testMode?: "LEVEL" | "CHAPTER";
  chapters?: { id: string; name: string; sortOrder: number; topics?: { id: string; name: string; sortOrder: number }[] }[];
  levels: LevelRow[];
  topics: TopicRow[];
  classSubjects?: { schoolClass: { id: string; name: string; grade: string | null } }[];
};
type ClassRow = { id: string; name: string; grade: string | null };
type QuestionRow = {
  id: string;
  topicId: string;
  type?: QuestionType;
  stem: string;
  stemImageUrl?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  correctNumeric?: number | null;
  numericTolerance?: number;
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
  imagesAttached?: number;
};

type ParsedQuestionPreview = {
  type?: QuestionType;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  correctNumeric?: number | null;
  numericTolerance?: number;
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
  const [chapterTopicId, setChapterTopicId] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [topicQuestionCount, setTopicQuestionCount] = useState<Map<string, number>>(new Map());
  const [folderQuestionCount, setFolderQuestionCount] = useState<Map<string, number>>(new Map());
  const [untaggedQuestionCount, setUntaggedQuestionCount] = useState<Map<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const [form, setForm] = useState({
    type: "MCQ" as QuestionType,
    stem: "",
    stemImageUrl: "" as string,
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    correctOption: "0",
    correctNumeric: "",
    numericTolerance: "0",
    difficulty: "MEDIUM" as "EASY" | "MEDIUM" | "HARD",
    editId: "",
  });
  const [imageUploading, setImageUploading] = useState(false);
  const stemImageInputRef = useRef<HTMLInputElement | null>(null);
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
  const isChapterMode = selectedSubject?.testMode === "CHAPTER";
  const levelOptions = selectedSubject?.levels ?? [];
  const topicOptions = useMemo(() => {
    if (!selectedSubject) return [];
    if (isChapterMode) {
      if (selectedSubject.chapters?.length) return selectedSubject.chapters.map((c) => ({ id: c.id, name: c.name, levelId: null }));
      return (selectedSubject.topics ?? []).filter((t) => t.levelId == null);
    }
    return (selectedSubject.topics ?? []).filter((t) => (levelId ? t.levelId === levelId : false));
  }, [selectedSubject, levelId, isChapterMode]);
  const apiLevelId = isChapterMode ? "none" : levelId;
  const chapterFolders = useMemo(() => {
    if (!isChapterMode || !topicId) return [];
    return selectedSubject?.chapters?.find((c) => c.id === topicId)?.topics ?? [];
  }, [isChapterMode, selectedSubject, topicId]);
  const needsFolder = chapterFolders.length > 0;
  const viewingUntagged = chapterTopicId === "none";
  const bankReady = Boolean(subjectId && topicId && (isChapterMode || levelId) && (!needsFolder || (chapterTopicId && !viewingUntagged)));
  const levelNameById = useMemo(
    () => new Map((selectedSubject?.levels ?? []).map((l) => [l.id, l.name])),
    [selectedSubject]
  );

  useEffect(() => {
    if (isChapterMode) {
      if (levelId) setLevelId("");
      return;
    }
    if (!selectedSubject || !selectedSubject.levels.some((l) => l.id === levelId)) {
      setLevelId("");
      setTopicId("");
    }
  }, [selectedSubject, levelId, isChapterMode]);

  useEffect(() => {
    if (!topicOptions.some((t) => t.id === topicId)) setTopicId("");
  }, [topicOptions, topicId]);

  useEffect(() => {
    setChapterTopicId("");
  }, [topicId]);

  useEffect(() => {
    if (!topicId) {
      setQuestions([]);
      return;
    }
    if (needsFolder && !chapterTopicId) {
      setQuestions([]);
      return;
    }
    void loadQuestions(topicId, subjectId, apiLevelId, needsFolder ? chapterTopicId : "");
  }, [topicId, subjectId, apiLevelId, chapterTopicId, needsFolder]);

  useEffect(() => {
    if (!subjectId || (!isChapterMode && !levelId)) {
      setTopicQuestionCount(new Map());
      return;
    }
    void loadLevelQuestionStatus(subjectId, apiLevelId);
  }, [subjectId, levelId, isChapterMode, apiLevelId]);

  async function loadQuestions(currentTopicId: string, currentSubjectId: string, currentLevelId: string, currentFolderId = "") {
    const q = new URLSearchParams();
    q.set("topicId", currentTopicId);
    if (currentSubjectId) q.set("subjectId", currentSubjectId);
    if (currentLevelId) q.set("levelId", currentLevelId);
    if (currentFolderId) q.set("chapterTopicId", currentFolderId);
    const r = await api<QuestionRow[]>(`/api/v1/admin/questions?${q.toString()}`);
    if (!r.ok) setErr(r.error ?? "Failed to load questions");
    else setQuestions(r.data ?? []);
  }

  async function loadLevelQuestionStatus(currentSubjectId: string, currentLevelId: string) {
    const q = new URLSearchParams();
    q.set("subjectId", currentSubjectId);
    if (currentLevelId) q.set("levelId", currentLevelId);
    const r = await api<{ topicId: string; chapterTopicId?: string | null; count: number }[]>(
      `/api/v1/admin/questions/counts?${q.toString()}`
    );
    if (!r.ok) {
      setErr(r.error ?? "Failed to load topic question status");
      return;
    }
    const map = new Map<string, number>();
    const folders = new Map<string, number>();
    const untagged = new Map<string, number>();
    for (const row of r.data ?? []) {
      map.set(row.topicId, (map.get(row.topicId) ?? 0) + row.count);
      if (row.chapterTopicId) folders.set(row.chapterTopicId, row.count);
      else untagged.set(row.topicId, (untagged.get(row.topicId) ?? 0) + row.count);
    }
    setTopicQuestionCount(map);
    setFolderQuestionCount(folders);
    setUntaggedQuestionCount(untagged);
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
      type: "MCQ",
      stem: "",
      stemImageUrl: "",
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      correctOption: "0",
      correctNumeric: "",
      numericTolerance: "0",
      difficulty: "MEDIUM",
      editId: "",
    });
    if (stemImageInputRef.current) stemImageInputRef.current.value = "";
  }

  async function uploadStemImage(file: File) {
    setImageUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const token = getToken();
      const base = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${base}/api/v1/admin/question-images`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setErr(data.error ?? "Image upload failed");
        return;
      }
      setForm((x) => ({ ...x, stemImageUrl: data.url! }));
    } catch {
      setErr("Image upload failed");
    } finally {
      setImageUploading(false);
    }
  }

  async function saveQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId || !topicId || (!isChapterMode && !levelId)) return;
    if (needsFolder && (!chapterTopicId || chapterTopicId === "none")) {
      setErr("Choose a topic in this chapter");
      return;
    }
    const type = form.type;
    const numericAnswer = parseNumericInput(form.correctNumeric);
    if (type === "NUMERIC" && numericAnswer == null) {
      setErr("Enter a numeric answer");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload = {
      subjectId,
      ...(isChapterMode ? {} : { levelId }),
      topicId,
      ...(needsFolder && chapterTopicId && chapterTopicId !== "none" ? { chapterTopicId } : {}),
      type,
      stem: form.stem.trim(),
      optionA: type === "NUMERIC" ? "" : form.optionA.trim(),
      optionB: type === "NUMERIC" ? "" : form.optionB.trim(),
      optionC: type === "MCQ" ? form.optionC.trim() : "",
      optionD: type === "MCQ" ? form.optionD.trim() : "",
      correctOption: type === "NUMERIC" ? 0 : parseInt(form.correctOption, 10),
      correctNumeric: type === "NUMERIC" ? numericAnswer : null,
      numericTolerance: type === "NUMERIC" ? parseNumericInput(form.numericTolerance) ?? 0 : 0,
      difficulty: form.difficulty,
      stemImageUrl: form.stemImageUrl || null,
    };
    const r = form.editId
      ? await api(`/api/v1/admin/questions/${form.editId}`, {
          method: "PATCH",
          json: {
            type: payload.type,
            stem: payload.stem,
            optionA: payload.optionA,
            optionB: payload.optionB,
            optionC: payload.optionC,
            optionD: payload.optionD,
            correctOption: payload.correctOption,
            correctNumeric: payload.correctNumeric,
            numericTolerance: payload.numericTolerance,
            difficulty: payload.difficulty,
            stemImageUrl: payload.stemImageUrl,
          },
        })
      : await api("/api/v1/admin/questions", { method: "POST", json: payload });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Save failed");
      return;
    }
    resetForm();
    await loadQuestions(topicId, subjectId, apiLevelId, needsFolder ? chapterTopicId : "");
    if (subjectId) await loadLevelQuestionStatus(subjectId, apiLevelId);
  }

  function startEdit(q: QuestionRow) {
    setForm({
      type: q.type ?? "MCQ",
      stem: q.stem,
      stemImageUrl: q.stemImageUrl ?? "",
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: String(q.correctOption),
      correctNumeric: q.correctNumeric != null ? String(q.correctNumeric) : "",
      numericTolerance: String(q.numericTolerance ?? 0),
      difficulty: q.difficulty,
      editId: q.id,
    });
    if (stemImageInputRef.current) stemImageInputRef.current.value = "";
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
    else await loadQuestions(topicId, subjectId, apiLevelId, needsFolder ? chapterTopicId : "");
  }

  async function importDocx(e: React.FormEvent) {
    e.preventDefault();
    if (!docxFile || !bankReady) return;
    setBusy(true);
    setImporting(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const fd = new FormData();
    fd.set("file", docxFile);
    fd.set("subjectId", subjectId);
    if (!isChapterMode) fd.set("levelId", levelId);
    fd.set("topicId", topicId);
    if (needsFolder && chapterTopicId && chapterTopicId !== "none") fd.set("chapterTopicId", chapterTopicId);
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
      await loadQuestions(topicId, subjectId, apiLevelId, needsFolder ? chapterTopicId : "");
    } catch {
      setErr("Upload failed due to network/server error. Please try again.");
    } finally {
      setBusy(false);
      setImporting(false);
    }
  }

  async function importSheet(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetFile || !bankReady) return;
    setBusy(true);
    setImporting(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const fd = new FormData();
    fd.set("file", sheetFile);
    fd.set("subjectId", subjectId);
    if (!isChapterMode) fd.set("levelId", levelId);
    fd.set("topicId", topicId);
    if (needsFolder && chapterTopicId && chapterTopicId !== "none") fd.set("chapterTopicId", chapterTopicId);
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
            : "Sheet import failed. Keep the file closed in Excel, use .xlsx, and try again.";
        setErr(msg);
        return;
      }
      const result = data as ImportResult;
      setImportMsg(
        `Sheet upload completed. Mode ${result.mode}: imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped} (parsed ${result.parseCount})${
          result.imagesAttached ? `, diagrams ${result.imagesAttached}` : ""
        }.`
      );
      if (result.errors?.length) setImportErrors(result.errors);
      await loadQuestions(topicId, subjectId, apiLevelId, needsFolder ? chapterTopicId : "");
      if (subjectId) await loadLevelQuestionStatus(subjectId, apiLevelId);
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

  async function addChapterTopic() {
    const name = newTopicName.trim();
    if (!subjectId || !topicId || !name) return;
    setBusy(true);
    setErr(null);
    const r = await api<{ id: string }>(`/api/v1/admin/subjects/${subjectId}/chapters/${topicId}/topics`, {
      method: "POST",
      json: { name },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not add topic");
      return;
    }
    setNewTopicName("");
    setChapterTopicId(r.data.id);
    await refreshSubjects();
    if (subjectId) await loadLevelQuestionStatus(subjectId, apiLevelId);
  }

  async function renameChapterTopic(id: string) {
    const name = editingTopicName.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/chapter-topics/${id}`, { method: "PATCH", json: { name } });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not rename topic");
      return;
    }
    cancelEditTopic();
    await refreshSubjects();
  }

  function removeChapterTopic(id: string, name: string) {
    confirmDialog.setRequest({
      title: "Remove topic",
      message: `Remove topic "${name}" from this chapter? Delete its questions first if it still has any.`,
      confirmLabel: "Remove topic",
      onConfirm: () => doRemoveChapterTopic(id),
    });
  }

  async function doRemoveChapterTopic(id: string) {
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/chapter-topics/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not remove topic");
      return;
    }
    if (chapterTopicId === id) setChapterTopicId("");
    await refreshSubjects();
    if (subjectId) await loadLevelQuestionStatus(subjectId, apiLevelId);
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
      title: isChapterMode ? "Remove chapter from this book" : "Delete chapter permanently",
      message: isChapterMode
        ? `Remove chapter "${t.name}" from this branch? Questions stay in the bank.`
        : `This will permanently delete chapter "${t.name}" and all its questions. This cannot be undone.`,
      requireTypedText: isChapterMode ? undefined : t.name,
      confirmLabel: isChapterMode ? "Remove chapter" : "Delete chapter",
      onConfirm: () => doRemoveTopic(t),
    });
  }

  async function doRemoveTopic(t: TopicRow) {
    setBusy(true);
    setErr(null);
    if (isChapterMode && subjectId) {
      const r = await api(`/api/v1/admin/subjects/${subjectId}/chapters/${t.id}`, { method: "DELETE" });
      setBusy(false);
      if (!r.ok) {
        setErr(r.error ?? "Could not remove chapter");
        return;
      }
      if (topicId === t.id) setTopicId("");
      await refreshSubjects();
      if (subjectId) await loadLevelQuestionStatus(subjectId, apiLevelId);
      return;
    }
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
    if (subjectId) await loadLevelQuestionStatus(subjectId, apiLevelId);
  }

  async function previewPaste() {
    if (!pasteText.trim() || !bankReady) return;
    setBusy(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const r = await api<DryRunResult>("/api/v1/admin/questions/import-text", {
      method: "POST",
      json: {
        subjectId,
        levelId: isChapterMode ? undefined : levelId,
        topicId,
      ...(needsFolder && chapterTopicId && chapterTopicId !== "none" ? { chapterTopicId } : {}),
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
    if (!pasteText.trim() || !bankReady) return;
    setBusy(true);
    setImporting(true);
    setErr(null);
    setImportMsg(null);
    setImportErrors([]);
    const r = await api<ImportResult>("/api/v1/admin/questions/import-text", {
      method: "POST",
      json: {
        subjectId,
        levelId: isChapterMode ? undefined : levelId,
        topicId,
      ...(needsFolder && chapterTopicId && chapterTopicId !== "none" ? { chapterTopicId } : {}),
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
    await loadQuestions(topicId, subjectId, apiLevelId, needsFolder ? chapterTopicId : "");
    if (subjectId) await loadLevelQuestionStatus(subjectId, apiLevelId);
  }

  async function downloadQuestionTemplate() {
    const XLSX = await import("xlsx");
    const rows = [
      ["type", "question", "optionA", "optionB", "optionC", "optionD", "answer", "tolerance", "difficulty", "diagram"],
      ["MCQ", "Find the distance between (2,3) and (6,6).", "3", "4", "5", "6", "C", "", "MEDIUM", ""],
      ["MCQ2", "Water boils at 100°C at sea level.", "True", "False", "", "", "A", "", "EASY", ""],
      ["NUMERIC", "What is 7 × 8?", "", "", "", "", "56", "0", "MEDIUM", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "question_bank_template.xlsx");
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Question bank</h1>
      <p className="mt-1 text-slate-600">
        For level branches, select subject, level, and topic. For book branches, select the chapter. Add topics only
        when that chapter is large.
      </p>
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
                  {s.testMode === "CHAPTER" ? " · chapters" : ""}
                </option>
              ))}
            </select>
          </label>
          {!isChapterMode ? (
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
          ) : null}
          <label className="text-sm">
            <span className="text-slate-600">{isChapterMode ? "Chapter" : "Topic"}</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={busy || !subjectId || (!isChapterMode && !levelId)}
            >
              <option value="">{isChapterMode ? "Select chapter" : "Select topic"}</option>
              {topicOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {!isChapterMode && t.levelId ? ` (${levelNameById.get(t.levelId) ?? "Level"})` : ""}
                  {` [${t.id.slice(-4)}]`}
                </option>
              ))}
            </select>
          </label>
          {needsFolder ? (
            <label className="text-sm">
              <span className="text-slate-600">Topic</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={chapterTopicId}
                onChange={(e) => setChapterTopicId(e.target.value)}
                disabled={busy}
              >
                <option value="">Select topic</option>
                {chapterFolders.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({folderQuestionCount.get(t.id) ?? 0})
                  </option>
                ))}
                {(untaggedQuestionCount.get(topicId) ?? 0) > 0 ? (
                  <option value="none">Not in a topic ({untaggedQuestionCount.get(topicId)})</option>
                ) : null}
              </select>
            </label>
          ) : null}
        </div>
        {isChapterMode && topicId ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h2 className="text-sm font-semibold text-slate-900">Topics in this chapter</h2>
            <p className="mt-1 text-sm text-slate-600">
              {needsFolder
                ? "New questions go into a topic. A test of the whole chapter still uses every topic."
                : "No topics yet. Questions upload to the whole chapter. Add a topic only if this chapter is large."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Topic name"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => void addChapterTopic()}
                disabled={busy || !newTopicName.trim()}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Add topic
              </button>
            </div>
            {chapterFolders.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {chapterFolders.map((t) => {
                  const count = folderQuestionCount.get(t.id) ?? 0;
                  const isEditing = editingTopicId === t.id;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                      {isEditing ? (
                        <>
                          <input
                            className="rounded border border-slate-300 px-2 py-1"
                            value={editingTopicName}
                            onChange={(e) => setEditingTopicName(e.target.value)}
                            disabled={busy}
                          />
                          <button type="button" className="text-brand-700" onClick={() => void renameChapterTopic(t.id)} disabled={busy}>
                            Save
                          </button>
                          <button type="button" onClick={cancelEditTopic}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="font-medium text-slate-900" onClick={() => setChapterTopicId(t.id)}>
                            {t.name}
                          </button>
                          <span className="text-slate-500">{count} question{count === 1 ? "" : "s"}</span>
                          <button type="button" className="text-slate-600" onClick={() => startEditTopic({ id: t.id, name: t.name, levelId: null })}>
                            Rename
                          </button>
                          <button type="button" className="text-red-700" onClick={() => removeChapterTopic(t.id, t.name)}>
                            Remove
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {subjectId && (isChapterMode || levelId) ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Topic-wise question status</h2>
          <p className="mt-1 text-sm text-slate-600">See coverage instantly and open a topic with one click.</p>
          {topicOptions.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              {isChapterMode ? "No chapters on this branch yet." : "No topics found for selected level."}
            </p>
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
          Paste questions separated by a blank line — or as a continuous paper with an Answer Key at the end.
          Supported types: 4-option MCQ, 2-option (A/B only), and numeric. Labels: <code>Q1.</code> /{" "}
          <code>Question 1.</code> / <code>प्रश्न १.</code> / <code>1.</code>; options <code>A) B) C) D)</code>,{" "}
          <code>(1) (2) (3) (4)</code>, or just <code>A) B)</code>; <code>Type: NUMERIC</code> with{" "}
          <code>Answer: 56</code>; answers <code>Answer:</code> / <code>Ans:</code> / <code>उत्तर:</code>.
        </p>
        <textarea
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono min-h-[200px]"
          placeholder={`Q1. What is 2 + 2?\nA) 3   B) 4   C) 5   D) 6\nAnswer: B\n\nQ2. Water boils at 100°C at sea level.\nA) True\nB) False\nAnswer: A\n\nQ3. What is 7 × 8?\nType: NUMERIC\nAnswer: 56`}
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
            disabled={busy || !pasteText.trim() || !bankReady}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Preview parse
          </button>
          <button
            type="button"
            onClick={() => void importPaste()}
            disabled={busy || !pasteText.trim() || !bankReady}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {importing ? "Saving…" : "Save all"}
          </button>
          {!bankReady && (
            <span className="text-xs text-amber-700">
              {isChapterMode
                ? needsFolder
                  ? "Select a topic in this chapter first."
                  : "Select subject and chapter above first."
                : "Select subject, level, and topic above first."}
            </span>
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
                Nothing parsed. Use 4 options, 2 options (A/B), or Type: NUMERIC with a number answer. Separate questions
                with a blank line.
              </p>
            ) : (
              <ol className="mt-2 space-y-3 text-sm">
                {pastePreview.slice(0, 20).map((q, i) => (
                  <li key={i} className="rounded border border-slate-200 px-3 py-2">
                    <p className="font-medium text-slate-900 whitespace-pre-wrap">
                      {i + 1}. [{questionTypeLabel(q.type)}] {q.stem}
                    </p>
                    {q.type === "NUMERIC" ? (
                      <p className="mt-1 text-sm text-emerald-700">
                        Answer: {q.correctNumeric}
                        {q.numericTolerance ? ` (±${q.numericTolerance})` : ""}
                      </p>
                    ) : (
                    <ul className="mt-1 grid gap-0.5 text-slate-700 sm:grid-cols-2">
                      {(q.type === "MCQ2" ? [q.optionA, q.optionB] : [q.optionA, q.optionB, q.optionC, q.optionD]).map(
                        (opt, idx) => (
                        <li
                          key={idx}
                          className={idx === q.correctOption ? "font-semibold text-emerald-700" : ""}
                        >
                          {String.fromCharCode(65 + idx)}) {opt}
                          {idx === q.correctOption ? "  ✓" : ""}
                        </li>
                        )
                      )}
                    </ul>
                    )}
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
            <label className="text-sm block">
              Question type
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                value={form.type}
                onChange={(e) =>
                  setForm((x) => ({
                    ...x,
                    type: e.target.value as QuestionType,
                    correctOption: e.target.value === "MCQ2" && Number(x.correctOption) > 1 ? "0" : x.correctOption,
                  }))
                }
                disabled={busy}
              >
                <option value="MCQ">4-option MCQ</option>
                <option value="MCQ2">2-option (True/False, Yes/No)</option>
                <option value="NUMERIC">Numeric value</option>
              </select>
            </label>
            <textarea
              ref={stemRef}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[88px]"
              placeholder="Question statement"
              value={form.stem}
              onChange={(e) => setForm((x) => ({ ...x, stem: e.target.value }))}
              disabled={busy}
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-700">Stem image (optional)</p>
              <input
                ref={stemImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="mt-1 block w-full text-xs text-slate-600"
                disabled={busy || imageUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadStemImage(file);
                }}
              />
              {imageUploading ? (
                <p className="mt-1 text-xs text-slate-500">Uploading…</p>
              ) : null}
              {form.stemImageUrl ? (
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <img
                    src={mediaUrl(form.stemImageUrl)}
                    alt="Stem preview"
                    className="max-h-40 max-w-full rounded border border-slate-200 object-contain bg-white"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setForm((x) => ({ ...x, stemImageUrl: "" }));
                      if (stemImageInputRef.current) stemImageInputRef.current.value = "";
                    }}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    Remove image
                  </button>
                </div>
              ) : null}
            </div>
            {form.type === "NUMERIC" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  Correct number
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="e.g. 56"
                    value={form.correctNumeric}
                    onChange={(e) => setForm((x) => ({ ...x, correctNumeric: e.target.value }))}
                    disabled={busy}
                  />
                </label>
                <label className="text-sm">
                  Tolerance
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="0"
                    value={form.numericTolerance}
                    onChange={(e) => setForm((x) => ({ ...x, numericTolerance: e.target.value }))}
                    disabled={busy}
                  />
                </label>
              </div>
            ) : (
              <>
            {(form.type === "MCQ2"
              ? (["optionA", "optionB"] as const)
              : (["optionA", "optionB", "optionC", "optionD"] as const)
            ).map((k, idx) => (
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
                  {form.type === "MCQ" ? (
                    <>
                      <option value="2">C</option>
                      <option value="3">D</option>
                    </>
                  ) : null}
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
              </>
            )}
            {form.type === "NUMERIC" ? (
            <label className="text-sm block">
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
            ) : null}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={busy || !bankReady || !form.stem.trim()}
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
            Columns: <span className="font-mono">type, question, optionA-D, answer, tolerance, difficulty, diagram</span>.
            Type is <span className="font-mono">MCQ</span>, <span className="font-mono">MCQ2</span>, or{" "}
            <span className="font-mono">NUMERIC</span>. Leave type blank to infer. 2-option rows use A/B only. Numeric
            rows use a number in answer. For figures, use <span className="font-mono">.xlsx</span> (not CSV) and insert
            the picture in the <span className="font-mono">diagram</span> column on that question’s row.
          </p>
          <button
            type="button"
            onClick={() => void downloadQuestionTemplate()}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            Download sample template (Excel)
          </button>
          <form onSubmit={importSheet} className="mt-3 space-y-3">
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={(e) => setSheetFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="block text-sm"
            />
            {sheetFile ? <p className="text-xs text-slate-600">Selected: {sheetFile.name}</p> : null}
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
              disabled={busy || !sheetFile || !bankReady}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {importing ? "Uploading..." : "Upload Excel/CSV"}
            </button>
            {!bankReady && (
              <span className="ml-2 text-xs text-amber-700">
                {isChapterMode
                ? needsFolder
                  ? "Select a topic in this chapter first."
                  : "Select subject and chapter above first."
                : "Select subject, level, and topic above first."}
              </span>
            )}
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Import from Word (.docx)</h2>
          <p className="text-xs text-slate-500 mt-1">
            Real papers work: questions can be 1. 2. 3. without blank lines; options A–D, (a)–(d), (1)–(4), or
            (i)–(iv); answers on each question (<code>Answer: B</code>) or an <code>Answer Key</code> at the end.
            Sync updates matching questions in this topic by stem. Replace clears this topic bank first, then imports.
            Use .docx (not .doc), max 15 MB.
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
              disabled={busy || !docxFile || !bankReady}
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
                {q.stemImageUrl ? (
                  <img
                    src={mediaUrl(q.stemImageUrl)}
                    alt=""
                    className="mt-2 max-h-28 rounded border border-slate-200 object-contain bg-slate-50"
                  />
                ) : null}
                <p className="text-xs text-slate-500 mt-1">
                  {questionTypeLabel(q.type)}
                  {q.type === "NUMERIC"
                    ? ` · Answer: ${q.correctNumeric}${q.numericTolerance ? ` ±${q.numericTolerance}` : ""}`
                    : ` · Correct: ${String.fromCharCode(65 + q.correctOption)}`}{" "}
                  | Difficulty: {q.difficulty}
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
