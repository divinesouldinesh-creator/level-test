import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "../../api";
import { useConfirmDialog, type ConfirmRequest } from "../../components/ConfirmDialog";

type RequestConfirm = (req: ConfirmRequest) => void;

type BulkRow = { name: string; weightPct: number };

/**
 * Parse pasted text where each line is "Topic name <sep> weight".
 * Separators recognized: tab, comma, semicolon, pipe, "=", or runs of spaces.
 * Trailing % signs are tolerated. Returns rows with valid name + 0..100 weight.
 */
function parseBulkPaste(text: string): BulkRow[] {
  const out: BulkRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)[\s,;=|\t]+(-?\d{1,3}(?:\.\d+)?)\s*%?$/);
    if (!m) continue;
    const name = m[1].trim();
    const weight = Math.max(0, Math.min(100, Math.round(Number(m[2]) || 0)));
    if (name) out.push({ name, weightPct: weight });
  }
  return out;
}

function parseBulkSheet(buf: ArrayBuffer): BulkRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  if (!wb.SheetNames.length) return [];
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const out: BulkRow[] = [];
  for (const r of rows) {
    const lookup: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) lookup[k.toLowerCase().replace(/[\s_]+/g, "")] = v;
    const name = String(
      lookup.topic ?? lookup.name ?? lookup.chapter ?? lookup.topicname ?? ""
    ).trim();
    const wRaw = lookup.weight ?? lookup.weightpct ?? lookup.percentage ?? lookup.percent ?? 0;
    const weight = Math.max(0, Math.min(100, Math.round(Number(wRaw) || 0)));
    if (name) out.push({ name, weightPct: weight });
  }
  return out;
}

type ClassRow = { id: string; name: string; grade: string | null };

type ChapterTopic = {
  topicId: string;
  weightPct: number;
  sortOrder: number;
  topic: { id: string; name: string };
};

type ChapterRow = {
  id: string;
  name: string;
  order: number;
  topicParticipations: ChapterTopic[];
  _count: { questions: number };
};

type SyllabusSubjectRow = {
  id: string;
  name: string;
  code: string | null;
  schoolClass: { id: string; name: string; grade: string | null };
  chapters: ChapterRow[];
  _count: { chapters: number };
};

export function SyllabusCurriculumPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SyllabusSubjectRow[]>([]);
  const [classFilter, setClassFilter] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const confirmDialog = useConfirmDialog();
  const requestConfirm: RequestConfirm = (req) => confirmDialog.setRequest(req);

  const refresh = useCallback(async () => {
    setErr(null);
    const [c, s] = await Promise.all([
      api<ClassRow[]>("/api/v1/admin/classes"),
      api<SyllabusSubjectRow[]>("/api/v1/admin/syllabus/subjects"),
    ]);
    if (!c.ok) setErr(c.error ?? "Failed to load classes");
    else if (c.data) setClasses(c.data);
    if (!s.ok) setErr(s.error ?? "Failed to load syllabus subjects");
    else if (s.data) setSubjects(s.data);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const visibleSubjects = useMemo(
    () => (classFilter ? subjects.filter((s) => s.schoolClass.id === classFilter) : subjects),
    [subjects, classFilter]
  );

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Syllabus curriculum</h1>
        <span className="text-xs rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 font-medium">
          Model 2 · class-specific syllabus tests
        </span>
      </div>
      <p className="mt-1 text-slate-600">
        Build chapter-based syllabus content for class-specific subjects (e.g. Physics — Class 11). Students pick
        any chapters, set difficulty (Easy / Medium / Hard), and practice. This is fully separate from the Skill
        curriculum.
      </p>
      {err && <p className="mt-4 text-rose-700">{err}</p>}
      {info && <p className="mt-4 text-emerald-700">{info}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <div className="mt-6 space-y-6">
          <CreateSubjectPanel
            classes={classes}
            busy={busy}
            setBusy={setBusy}
            setErr={setErr}
            setInfo={setInfo}
            onCreated={refresh}
          />

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-600">Filter by class</label>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.grade ? ` (${c.grade})` : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              {visibleSubjects.length} subject{visibleSubjects.length === 1 ? "" : "s"}
            </span>
          </div>

          {visibleSubjects.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No syllabus subjects yet. Create one above to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {visibleSubjects.map((s) => (
                <SubjectCard
                  key={s.id}
                  subject={s}
                  busy={busy}
                  setBusy={setBusy}
                  setErr={setErr}
                  setInfo={setInfo}
                  onChanged={refresh}
                  requestConfirm={requestConfirm}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {confirmDialog.element}
    </>
  );
}

function CreateSubjectPanel({
  classes,
  busy,
  setBusy,
  setErr,
  setInfo,
  onCreated,
}: {
  classes: ClassRow[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  setInfo: (s: string | null) => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [classId, setClassId] = useState("");

  async function submit() {
    if (!name.trim() || !classId) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    const r = await api("/api/v1/admin/syllabus/subjects", {
      method: "POST",
      json: { name: name.trim(), code: code.trim() || undefined, schoolClassId: classId },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not create subject");
      return;
    }
    setName("");
    setCode("");
    setInfo("Syllabus subject created.");
    await onCreated();
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <p className="font-semibold text-slate-900">Add a syllabus subject</p>
      <p className="mt-1 text-sm text-slate-600">
        One subject is tied to one class. Example: <em>Physics — Class 11</em> for Class 11 only.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">Select class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.grade ? ` (${c.grade})` : ""}
            </option>
          ))}
        </select>
        <input
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2"
          placeholder="Subject name (e.g. Physics — Class 11)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="Code (optional)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim() || !classId}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Add subject
        </button>
      </div>
    </div>
  );
}

function SubjectCard({
  subject,
  busy,
  setBusy,
  setErr,
  setInfo,
  onChanged,
  requestConfirm,
}: {
  subject: SyllabusSubjectRow;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  setInfo: (s: string | null) => void;
  onChanged: () => Promise<void>;
  requestConfirm: RequestConfirm;
}) {
  const [open, setOpen] = useState(false);
  const [newChapter, setNewChapter] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState("");

  async function rename() {
    const next = pendingName.trim();
    if (!next || next === subject.name) {
      setEditingName(null);
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/syllabus/subjects/${subject.id}`, {
      method: "PATCH",
      json: { name: next },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not rename");
      return;
    }
    setEditingName(null);
    await onChanged();
  }

  function removeSubject() {
    requestConfirm({
      title: "Delete subject permanently",
      message: `This will permanently delete subject "${subject.name}" and all its chapters, topics, and questions. This cannot be undone.`,
      requireTypedText: subject.name,
      confirmLabel: "Delete subject",
      onConfirm: async () => {
        setBusy(true);
        setErr(null);
        const r = await api(`/api/v1/admin/syllabus/subjects/${subject.id}`, { method: "DELETE" });
        setBusy(false);
        if (!r.ok) {
          setErr(r.error ?? "Delete failed");
          return;
        }
        setInfo("Subject deleted.");
        await onChanged();
      },
    });
  }

  async function addChapter() {
    const name = newChapter.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/syllabus/subjects/${subject.id}/chapters`, {
      method: "POST",
      json: { name },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not add chapter");
      return;
    }
    setNewChapter("");
    await onChanged();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500">{subject.schoolClass.name}</p>
          {editingName == null ? (
            <p className="text-lg font-semibold text-slate-900">
              {subject.name}
              {subject.code ? <span className="ml-2 text-sm text-slate-500">{subject.code}</span> : null}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void rename()}
                disabled={busy}
                className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingName(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">
            {subject._count.chapters} chapter{subject._count.chapters === 1 ? "" : "s"}
          </span>
          {editingName == null && (
            <button
              type="button"
              className="text-xs rounded border border-slate-300 bg-white px-2 py-1"
              onClick={() => {
                setEditingName(subject.id);
                setPendingName(subject.name);
              }}
            >
              Rename
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs rounded border border-slate-300 bg-white px-2 py-1"
          >
            {open ? "Hide" : "Open"}
          </button>
          <button
            type="button"
            onClick={() => removeSubject()}
            disabled={busy}
            className="text-xs rounded border border-rose-400 bg-white text-rose-700 px-2 py-1 disabled:opacity-50"
          >
            Delete subject
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm flex-1 min-w-[200px]"
              placeholder="New chapter name (e.g. Kinematics)"
              value={newChapter}
              onChange={(e) => setNewChapter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addChapter();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void addChapter()}
              disabled={busy || !newChapter.trim()}
              className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Add chapter
            </button>
          </div>

          {subject.chapters.length === 0 ? (
            <p className="text-sm text-slate-500">No chapters yet.</p>
          ) : (
            <div className="space-y-3">
              {subject.chapters.map((c) => (
                <ChapterCard
                  key={c.id}
                  chapter={c}
                  busy={busy}
                  setBusy={setBusy}
                  setErr={setErr}
                  setInfo={setInfo}
                  onChanged={onChanged}
                  requestConfirm={requestConfirm}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChapterCard({
  chapter,
  busy,
  setBusy,
  setErr,
  setInfo,
  onChanged,
  requestConfirm,
}: {
  chapter: ChapterRow;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  setInfo: (s: string | null) => void;
  onChanged: () => Promise<void>;
  requestConfirm: RequestConfirm;
}) {
  const [editingName, setEditingName] = useState(false);
  const [pendingName, setPendingName] = useState(chapter.name);
  const [newTopic, setNewTopic] = useState("");
  const [newTopicWeight, setNewTopicWeight] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null);
  const [bulkMode, setBulkMode] = useState<"replace" | "merge">("replace");
  const [draftWeights, setDraftWeights] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const tp of chapter.topicParticipations) out[tp.topicId] = String(tp.weightPct);
    return out;
  });

  useEffect(() => {
    const out: Record<string, string> = {};
    for (const tp of chapter.topicParticipations) out[tp.topicId] = String(tp.weightPct);
    setDraftWeights(out);
  }, [chapter.topicParticipations]);

  const draftSum = useMemo(() => {
    let total = 0;
    for (const k of Object.keys(draftWeights)) total += Number(draftWeights[k]) || 0;
    return total;
  }, [draftWeights]);

  async function rename() {
    const next = pendingName.trim();
    if (!next || next === chapter.name) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/syllabus/chapters/${chapter.id}`, {
      method: "PATCH",
      json: { name: next },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not rename");
      return;
    }
    setEditingName(false);
    await onChanged();
  }

  function deleteChapter() {
    requestConfirm({
      title: "Delete chapter permanently",
      message: `This will permanently delete chapter "${chapter.name}". Its topic weightages and questions will also be removed. This cannot be undone.`,
      requireTypedText: chapter.name,
      confirmLabel: "Delete chapter",
      onConfirm: async () => {
        setBusy(true);
        setErr(null);
        const r = await api(`/api/v1/admin/syllabus/chapters/${chapter.id}`, { method: "DELETE" });
        setBusy(false);
        if (!r.ok) {
          setErr(r.error ?? "Delete failed");
          return;
        }
        setInfo("Chapter deleted.");
        await onChanged();
      },
    });
  }

  async function addTopic() {
    const name = newTopic.trim();
    if (!name) return;
    const weightPct = Math.max(
      0,
      Math.min(100, Math.round(Number(newTopicWeight) || 0))
    );
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/syllabus/chapters/${chapter.id}/topics`, {
      method: "POST",
      json: { name, weightPct },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not add topic");
      return;
    }
    setNewTopic("");
    setNewTopicWeight("");
    await onChanged();
  }

  async function bulkSheetUpload(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const rows = parseBulkSheet(buf);
      if (!rows.length) {
        setErr("No valid rows in the file. Expected columns: Topic, Weight.");
        return;
      }
      setBulkRows(rows);
      setBulkText(rows.map((r) => `${r.name}\t${r.weightPct}`).join("\n"));
    } catch {
      setErr("Could not read the file.");
    }
  }

  function previewBulk() {
    setBulkRows(parseBulkPaste(bulkText));
  }

  function saveBulk() {
    const items = bulkRows && bulkRows.length ? bulkRows : parseBulkPaste(bulkText);
    if (!items.length) {
      setErr("Paste at least one Topic, Weight row.");
      return;
    }
    const runImport = async () => {
      setBusy(true);
      setErr(null);
      const r = await api(`/api/v1/admin/syllabus/chapters/${chapter.id}/topics/bulk`, {
        method: "POST",
        json: { items, mode: bulkMode },
      });
      setBusy(false);
      if (!r.ok) {
        setErr(r.error ?? "Bulk import failed");
        return;
      }
      setInfo(`Bulk import OK (${bulkMode}, ${items.length} rows).`);
      setBulkText("");
      setBulkRows(null);
      setBulkOpen(false);
      await onChanged();
    };
    if (bulkMode === "replace" && chapter.topicParticipations.length > 0) {
      requestConfirm({
        title: "Replace all topics?",
        message: `This will replace all ${chapter.topicParticipations.length} existing topic${
          chapter.topicParticipations.length === 1 ? "" : "s"
        } in chapter "${chapter.name}" with these ${items.length}. Existing weightages will be lost.`,
        confirmLabel: "Replace",
        onConfirm: runImport,
      });
      return;
    }
    void runImport();
  }

  function downloadBulkTemplate() {
    const rows = [
      ["topic", "weight"],
      ["Velocity", 30],
      ["Acceleration", 25],
      ["Projectile motion", 20],
      ["Newton's laws", 25],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Topics");
    XLSX.writeFile(wb, "topic_weightage_template.xlsx");
  }

  const bulkPreviewSum = (bulkRows ?? []).reduce((acc, r) => acc + r.weightPct, 0);

  function removeTopic(topicId: string, topicName: string) {
    requestConfirm({
      title: "Remove topic from chapter",
      message: `Remove topic "${topicName}" from chapter "${chapter.name}"?\n\nThe topic itself stays in the system, only its weightage in this chapter is dropped.`,
      confirmLabel: "Remove",
      onConfirm: async () => {
        const next = chapter.topicParticipations
          .filter((tp) => tp.topicId !== topicId)
          .map((tp, i) => ({ topicId: tp.topicId, weightPct: tp.weightPct, sortOrder: i }));
        setBusy(true);
        setErr(null);
        const r = await api(`/api/v1/admin/syllabus/chapters/${chapter.id}/topics`, {
          method: "PUT",
          json: next,
        });
        setBusy(false);
        if (!r.ok) {
          setErr(r.error ?? "Could not remove topic");
          return;
        }
        await onChanged();
      },
    });
  }

  async function saveWeights() {
    const next = chapter.topicParticipations.map((tp, i) => ({
      topicId: tp.topicId,
      weightPct: Math.max(0, Math.min(100, Number(draftWeights[tp.topicId] ?? "0") || 0)),
      sortOrder: i,
    }));
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/syllabus/chapters/${chapter.id}/topics`, {
      method: "PUT",
      json: next,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not save weightages");
      return;
    }
    setInfo("Weightages saved.");
    await onChanged();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editingName ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm"
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void rename()}
              disabled={busy}
              className="rounded-lg bg-indigo-600 text-white px-3 py-1 text-xs font-semibold"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingName(false);
                setPendingName(chapter.name);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className="font-medium text-slate-900">
            {chapter.name}
            <span className="ml-2 text-xs text-slate-500">
              {chapter._count.questions} question{chapter._count.questions === 1 ? "" : "s"}
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!editingName && (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-xs rounded border border-slate-300 bg-white px-2 py-1"
            >
              Rename
            </button>
          )}
          <button
            type="button"
            onClick={() => deleteChapter()}
            disabled={busy}
            className="text-xs rounded border border-rose-300 bg-white text-rose-700 px-2 py-1 disabled:opacity-50"
          >
            Delete chapter
          </button>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs text-slate-600">
          Topic weightages decide how questions distribute when a student picks this chapter. They don't have to sum
          to 100 — they're auto-normalized at test build time.
        </p>
        {chapter.topicParticipations.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No topics yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-1.5">Topic</th>
                  <th className="py-1.5 w-32">Weight (%)</th>
                  <th className="py-1.5 w-20">Action</th>
                </tr>
              </thead>
              <tbody>
                {chapter.topicParticipations.map((tp) => (
                  <tr key={tp.topicId} className="border-b border-slate-100">
                    <td className="py-1.5 text-slate-800">{tp.topic.name}</td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                        value={draftWeights[tp.topicId] ?? "0"}
                        onChange={(e) =>
                          setDraftWeights((d) => ({ ...d, [tp.topicId]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        onClick={() => removeTopic(tp.topicId, tp.topic.name)}
                        disabled={busy}
                        className="text-xs rounded border border-rose-300 bg-white text-rose-700 px-2 py-1 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 text-xs text-slate-500" colSpan={3}>
                    Sum of weights: <span className="font-medium">{draftSum}%</span>{" "}
                    {draftSum !== 100 ? "(auto-normalized at test build)" : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {chapter.topicParticipations.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => void saveWeights()}
              disabled={busy}
              className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Save weightages
            </button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm flex-1 min-w-[200px]"
            placeholder="Add topic (e.g. Velocity)"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addTopic();
              }
            }}
          />
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
            placeholder="Weight %"
            value={newTopicWeight}
            onChange={(e) => setNewTopicWeight(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addTopic();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void addTopic()}
            disabled={busy || !newTopic.trim()}
            className="rounded-lg border border-indigo-300 bg-white text-indigo-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Add topic
          </button>
          <button
            type="button"
            onClick={() => setBulkOpen((o) => !o)}
            className="rounded-lg border border-slate-300 bg-white text-slate-700 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {bulkOpen ? "Hide bulk import" : "Bulk import…"}
          </button>
        </div>

        {bulkOpen && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-slate-900 text-sm">Bulk add topics + weightages</p>
              <span className="text-xs text-slate-500">
                Tip: copy two columns (Topic, Weight) straight from Excel.
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={`bulkmode-${chapter.id}`}
                  checked={bulkMode === "replace"}
                  onChange={() => setBulkMode("replace")}
                />
                Replace all topics in this chapter
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={`bulkmode-${chapter.id}`}
                  checked={bulkMode === "merge"}
                  onChange={() => setBulkMode("merge")}
                />
                Merge (update matches, keep others)
              </label>
            </div>
            <textarea
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono min-h-[120px]"
              placeholder={`Velocity, 30\nAcceleration, 25\nProjectile motion, 20\nNewton's laws, 25\n\n(Comma, tab, "=", or spaces work as separators.)`}
              value={bulkText}
              onChange={(e) => {
                setBulkText(e.target.value);
                if (bulkRows) setBulkRows(null);
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 cursor-pointer">
                <span>Upload .xlsx / .csv</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void bulkSheetUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={downloadBulkTemplate}
                className="rounded-lg border border-slate-300 bg-white text-slate-700 px-3 py-1.5"
              >
                Template
              </button>
              <button
                type="button"
                onClick={previewBulk}
                disabled={busy || !bulkText.trim()}
                className="rounded-lg border border-indigo-300 bg-white text-indigo-700 px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => saveBulk()}
                disabled={busy || (!bulkText.trim() && !bulkRows?.length)}
                className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 font-semibold disabled:opacity-50"
              >
                Save to chapter
              </button>
            </div>
            {bulkRows && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                <p className="text-xs text-slate-600">
                  Parsed <strong>{bulkRows.length}</strong> row
                  {bulkRows.length === 1 ? "" : "s"}. Sum of weights:{" "}
                  <strong>{bulkPreviewSum}%</strong>{" "}
                  {bulkPreviewSum !== 100 ? "(auto-normalized at test build)" : ""}
                </p>
                <table className="mt-1 w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="py-1">#</th>
                      <th className="py-1">Topic</th>
                      <th className="py-1 w-20">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.slice(0, 30).map((r, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-0.5 text-slate-400">{i + 1}</td>
                        <td className="py-0.5 text-slate-800">{r.name}</td>
                        <td className="py-0.5 text-slate-700">{r.weightPct}%</td>
                      </tr>
                    ))}
                    {bulkRows.length > 30 && (
                      <tr>
                        <td className="py-1 text-slate-400 text-xs" colSpan={3}>
                          …and {bulkRows.length - 30} more.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
