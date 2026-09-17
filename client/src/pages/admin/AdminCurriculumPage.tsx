import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useConfirmDialog, type ConfirmRequest } from "../../components/ConfirmDialog";

type RequestConfirm = (req: ConfirmRequest) => void;

type SectionRow = { id: string; name: string };
type ClassSubjectLink = { subject: { id: string; name: string; code: string | null } };
type SchoolClassMeta = {
  id: string;
  name: string;
  grade: string | null;
  sections: SectionRow[];
  subjects: ClassSubjectLink[];
};

type LevelTestConfig = { questionCount: number } | null;
type LevelTopicPart = {
  topicId: string;
  quota: number | null;
  sortOrder: number;
  topic: { id: string; name: string };
};
type CurriculumLevel = {
  id: string;
  name: string;
  order: number;
  testConfig: LevelTestConfig;
  levelTopicParticipations: LevelTopicPart[];
};
type CurriculumTopic = {
  id: string;
  name: string;
};
type CurriculumChapter = {
  id: string;
  name: string;
  sortOrder: number;
};
type CurriculumSubject = {
  id: string;
  name: string;
  code: string | null;
  areaId: string | null;
  testMode?: "LEVEL" | "CHAPTER";
  chapterTestQuestionCount?: number;
  chapterNegativeMarking?: boolean;
  chapterWrongPenalty?: number;
  area: { id: string; name: string; code: string | null } | null;
  levels: CurriculumLevel[];
  chapters?: CurriculumChapter[];
  topics: { id: string; name: string; levelId: string | null }[];
};
const NO_TOPICS: CurriculumTopic[] = [];

type SubjectAreaRow = {
  id: string;
  name: string;
  code: string | null;
  sortOrder: number;
  branchCount: number;
  branches: { id: string; name: string; code: string | null; testMode?: "LEVEL" | "CHAPTER" }[];
};

export function AdminCurriculumPage() {
  const [classes, setClasses] = useState<SchoolClassMeta[]>([]);
  const [subjects, setSubjects] = useState<CurriculumSubject[]>([]);
  const [areas, setAreas] = useState<SubjectAreaRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const confirmDialog = useConfirmDialog();
  const requestConfirm: RequestConfirm = (req) => confirmDialog.setRequest(req);

  const refresh = useCallback(async () => {
    setErr(null);
    const [c, s, a] = await Promise.all([
      api<SchoolClassMeta[]>("/api/v1/admin/classes"),
      api<CurriculumSubject[]>("/api/v1/admin/subjects"),
      api<SubjectAreaRow[]>("/api/v1/admin/subject-areas"),
    ]);
    if (!c.ok) setErr(c.error ?? "Failed to load classes");
    else if (c.data) setClasses(c.data);
    if (!s.ok) setErr(s.error ?? "Failed to load branches");
    else if (s.data) setSubjects(s.data);
    if (!a.ok) setErr(a.error ?? "Failed to load subjects");
    else if (a.data) setAreas(a.data);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const subjectOptions = subjects.map((su) => ({ id: su.id, label: su.code ? `${su.name} (${su.code})` : su.name }));

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Curriculum &amp; classes</h1>
      <p className="text-slate-600 mt-1">
        Create classes, then add subjects (Maths, English) and branches. A branch can use levels (skill tests) or
        chapters (book tests like NCERT). Level tests stay as they are. Students only see branches linked to their class.
      </p>
      {err && <p className="text-red-600 mt-4">{err}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ClassesPanel
            classes={classes}
            subjectOptions={subjectOptions}
            busy={busy}
            setBusy={setBusy}
            setErr={setErr}
            onChanged={refresh}
            requestConfirm={requestConfirm}
          />
          <AreasPanel
            classes={classes}
            areas={areas}
            subjects={subjects}
            busy={busy}
            setBusy={setBusy}
            setErr={setErr}
            onChanged={refresh}
            requestConfirm={requestConfirm}
          />
        </div>
      )}
      {confirmDialog.element}
    </>
  );
}

function ClassesPanel({
  classes,
  subjectOptions,
  busy,
  setBusy,
  setErr,
  onChanged,
  requestConfirm,
}: {
  classes: SchoolClassMeta[];
  subjectOptions: { id: string; label: string }[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  onChanged: () => Promise<void>;
  requestConfirm: RequestConfirm;
}) {
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [sectionInputs, setSectionInputs] = useState<Record<string, string>>({});
  const [linkPick, setLinkPick] = useState<Record<string, string>>({});

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await api<SchoolClassMeta>("/api/v1/admin/classes", {
      method: "POST",
      json: { name: newName.trim(), grade: newGrade.trim() || undefined },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not create class");
    else {
      setNewName("");
      setNewGrade("");
      await onChanged();
    }
  }

  async function addSection(classId: string) {
    const name = (sectionInputs[classId] ?? "").trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/classes/${classId}/sections`, {
      method: "POST",
      json: { name },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not add section");
    else {
      setSectionInputs((m) => ({ ...m, [classId]: "" }));
      await onChanged();
    }
  }

  async function linkSubject(classId: string, subjectId: string) {
    if (!subjectId) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/classes/${classId}/subjects`, {
      method: "POST",
      json: { subjectId },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not link subject");
    else {
      setLinkPick((m) => ({ ...m, [classId]: "" }));
      await onChanged();
    }
  }

  function unlinkSubject(classId: string, subjectId: string, subjectName: string, className: string) {
    requestConfirm({
      title: "Remove subject from class",
      message: `Remove subject "${subjectName}" from class "${className}"?\n\nThe subject and its content stay in the system, only this class loses access.`,
      confirmLabel: "Remove",
      onConfirm: async () => {
        setBusy(true);
        setErr(null);
        const r = await api(`/api/v1/admin/classes/${classId}/subjects/${subjectId}`, {
          method: "DELETE",
        });
        setBusy(false);
        if (!r.ok) setErr(r.error ?? "Could not remove subject");
        else await onChanged();
      },
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-lg text-slate-900">School classes</h2>
      <form onSubmit={addClass} className="mt-4 flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Class name</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-base min-w-[180px]"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Class 8"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Grade (optional)</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 w-24 text-base"
            value={newGrade}
            onChange={(e) => setNewGrade(e.target.value)}
            placeholder="8"
            disabled={busy}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add class
        </button>
      </form>

      <ul className="mt-6 divide-y divide-slate-100">
        {classes.map((c) => {
          const linkedIds = new Set(c.subjects.map((s) => s.subject.id));
          const addOptions = subjectOptions.filter((o) => !linkedIds.has(o.id));
          return (
            <li key={c.id} className="py-4 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-2 justify-between">
                <div>
                  <span className="font-medium text-slate-900">{c.name}</span>
                  {c.grade ? <span className="text-slate-500 text-sm ml-2">Grade {c.grade}</span> : null}
                </div>
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Sections:{" "}
                {c.sections.length ? (
                  c.sections.map((s) => (
                    <span key={s.id} className="inline-block mr-2 rounded bg-slate-100 px-2 py-0.5">
                      {s.name}
                    </span>
                  ))
                ) : (
                  <span className="text-amber-700">None yet — add at least one section for students.</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm w-28"
                  placeholder="Section"
                  value={sectionInputs[c.id] ?? ""}
                  onChange={(e) => setSectionInputs((m) => ({ ...m, [c.id]: e.target.value }))}
                  disabled={busy}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addSection(c.id)}
                  className="text-sm font-medium text-slate-700 underline disabled:opacity-50"
                >
                  Add section
                </button>
              </div>
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Subjects for this class</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {c.subjects.map((cs) => (
                    <span
                      key={cs.subject.id}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-900 pl-3 pr-1 py-1 text-sm"
                    >
                      {cs.subject.name}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => unlinkSubject(c.id, cs.subject.id, cs.subject.name, c.name)}
                        className="rounded-full p-1 hover:bg-indigo-100 text-indigo-700"
                        aria-label={`Remove ${cs.subject.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {addOptions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    <select
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm min-w-[160px]"
                      value={linkPick[c.id] ?? ""}
                      onChange={(e) => setLinkPick((m) => ({ ...m, [c.id]: e.target.value }))}
                      disabled={busy}
                    >
                      <option value="">Add subject…</option>
                      {addOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy || !(linkPick[c.id] ?? "").trim()}
                      onClick={() => void linkSubject(c.id, linkPick[c.id] ?? "")}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      Link
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">All subjects are already linked (or create a new subject).</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AreasPanel({
  classes,
  areas,
  subjects,
  busy,
  setBusy,
  setErr,
  onChanged,
  requestConfirm,
}: {
  classes: SchoolClassMeta[];
  areas: SubjectAreaRow[];
  subjects: CurriculumSubject[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  onChanged: () => Promise<void>;
  requestConfirm: RequestConfirm;
}) {
  const [areaName, setAreaName] = useState("");
  const [areaCode, setAreaCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchAreaId, setBranchAreaId] = useState("");
  const [branchClassId, setBranchClassId] = useState("");
  const [branchTestMode, setBranchTestMode] = useState<"LEVEL" | "CHAPTER">("LEVEL");

  const subjectsById = useMemo(() => {
    const m = new Map<string, CurriculumSubject>();
    for (const s of subjects) m.set(s.id, s);
    return m;
  }, [subjects]);

  async function addArea(e: React.FormEvent) {
    e.preventDefault();
    if (!areaName.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await api("/api/v1/admin/subject-areas", {
      method: "POST",
      json: { name: areaName.trim(), code: areaCode.trim() || undefined },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not create subject");
    else {
      setAreaName("");
      setAreaCode("");
      await onChanged();
    }
  }

  async function addBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!branchName.trim() || !branchAreaId) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/subject-areas/${branchAreaId}/branches`, {
      method: "POST",
      json: {
        name: branchName.trim(),
        code: branchCode.trim() || undefined,
        classId: branchClassId || undefined,
        testMode: branchTestMode,
      },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not create branch");
    else {
      setBranchName("");
      setBranchCode("");
      setBranchTestMode("LEVEL");
      await onChanged();
    }
  }

  async function deleteArea(area: SubjectAreaRow) {
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/subject-areas/${area.id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not delete subject");
    else await onChanged();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-lg text-slate-900">Subjects → Branches → Learn / Test</h2>
      <p className="mt-1 text-sm text-slate-600">
        Add a subject (Maths, English), then branches under it. Choose Levels or Chapters for each branch.
      </p>

      <form onSubmit={addArea} className="mt-4 flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">New subject</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-base min-w-[160px]"
            value={areaName}
            onChange={(e) => setAreaName(e.target.value)}
            placeholder="e.g. Maths"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Code</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 w-24 text-base"
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value)}
            placeholder="MATHS"
            disabled={busy}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !areaName.trim()}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add subject
        </button>
      </form>

      <form onSubmit={addBranch} className="mt-3 flex flex-wrap gap-2 items-end border-t border-slate-100 pt-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Under subject</span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-base min-w-[150px]"
            value={branchAreaId}
            onChange={(e) => setBranchAreaId(e.target.value)}
            disabled={busy}
          >
            <option value="">Select subject</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Branch name</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-base min-w-[180px]"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="e.g. Basic Mathematics"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Code</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 w-24 text-base"
            value={branchCode}
            onChange={(e) => setBranchCode(e.target.value)}
            placeholder="MATH"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Test type</span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-base min-w-[150px]"
            value={branchTestMode}
            onChange={(e) => setBranchTestMode(e.target.value as "LEVEL" | "CHAPTER")}
            disabled={busy}
          >
            <option value="LEVEL">Levels</option>
            <option value="CHAPTER">Chapters (book)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Link to class (optional)</span>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-base min-w-[150px]"
            value={branchClassId}
            onChange={(e) => setBranchClassId(e.target.value)}
            disabled={busy}
          >
            <option value="">None yet</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.grade ? ` (Grade ${c.grade})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !branchAreaId || !branchName.trim()}
          className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add branch
        </button>
      </form>

      <div className="mt-6 space-y-4">
        {areas.length === 0 ? (
          <p className="text-sm text-slate-500">No subjects yet. Add Maths or English above.</p>
        ) : (
          areas.map((area) => (
            <details key={area.id} className="rounded-lg border border-slate-200 bg-slate-50 open:bg-white" open>
              <summary className="cursor-pointer list-none px-3 py-3 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold text-slate-900">{area.name}</span>
                  {area.code && <span className="ml-2 text-xs text-slate-500">{area.code}</span>}
                  <span className="ml-2 text-xs text-slate-500">
                    {area.branchCount} branch{area.branchCount === 1 ? "" : "es"}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy || area.branchCount > 0}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    requestConfirm({
                      title: "Delete subject",
                      message: `Delete subject "${area.name}"? Only empty subjects can be deleted.`,
                      confirmLabel: "Delete",
                      onConfirm: () => deleteArea(area),
                    });
                  }}
                  className="text-xs rounded border border-rose-300 text-rose-700 bg-white px-2 py-1 disabled:opacity-40"
                >
                  Delete subject
                </button>
              </summary>
              <div className="border-t border-slate-100 px-3 pb-3 space-y-3">
                {area.branches.length === 0 ? (
                  <p className="text-sm text-slate-500 pt-2">No branches yet. Add one above.</p>
                ) : (
                  area.branches.map((b) => {
                    const full = subjectsById.get(b.id);
                    if (!full) {
                      return (
                        <p key={b.id} className="text-sm text-slate-500 pt-2">
                          {b.name}
                        </p>
                      );
                    }
                    return (
                      <SubjectCard
                        key={full.id}
                        subject={full}
                        areas={areas}
                        busy={busy}
                        setBusy={setBusy}
                        setErr={setErr}
                        onChanged={onChanged}
                        requestConfirm={requestConfirm}
                      />
                    );
                  })
                )}
              </div>
            </details>
          ))
        )}

        {subjects.some((s) => !s.areaId) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">Unassigned branches</p>
            <p className="text-xs text-amber-800 mt-1">
              Assign each branch to Maths or English using Rename / Set subject.
            </p>
            <div className="mt-2 space-y-2">
              {subjects
                .filter((s) => !s.areaId)
                .map((full) => (
                  <SubjectCard
                    key={full.id}
                    subject={full}
                    areas={areas}
                    busy={busy}
                    setBusy={setBusy}
                    setErr={setErr}
                    onChanged={onChanged}
                    requestConfirm={requestConfirm}
                  />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectCard({
  subject,
  areas = [],
  busy,
  setBusy,
  setErr,
  onChanged,
  requestConfirm,
}: {
  subject: CurriculumSubject;
  areas?: SubjectAreaRow[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  onChanged: () => Promise<void>;
  requestConfirm: RequestConfirm;
}) {
  const [section, setSection] = useState<"learn" | "test">("test");
  const [levelName, setLevelName] = useState("");
  const [editingSubject, setEditingSubject] = useState(false);
  const [editingSubjectName, setEditingSubjectName] = useState(subject.name);
  const [editingSubjectCode, setEditingSubjectCode] = useState(subject.code ?? "");
  const [editingAreaId, setEditingAreaId] = useState(subject.areaId ?? "");
  const [editingTestMode, setEditingTestMode] = useState<"LEVEL" | "CHAPTER">(subject.testMode ?? "LEVEL");
  const [editingQuestionCount, setEditingQuestionCount] = useState(String(subject.chapterTestQuestionCount ?? 10));
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editingLevelName, setEditingLevelName] = useState("");
  const [openLevelId, setOpenLevelId] = useState<string | null>(null);

  const topicsByLevelId = useMemo(() => {
    const m = new Map<string, CurriculumTopic[]>();
    for (const lvl of subject.levels) {
      m.set(lvl.id, lvl.levelTopicParticipations.map((p) => p.topic));
    }
    return m;
  }, [subject.levels]);

  async function addLevel(e: React.FormEvent) {
    e.preventDefault();
    if (!levelName.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/subjects/${subject.id}/levels`, {
      method: "POST",
      json: { name: levelName.trim() },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not add level");
    else {
      setLevelName("");
      await onChanged();
    }
  }

  async function removeSubject(force = false) {
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/subjects/${subject.id}${force ? "?force=1" : ""}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not delete subject");
    else await onChanged();
  }

  async function removeLevel(levelId: string, force = false) {
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/levels/${levelId}${force ? "?force=1" : ""}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not delete level");
    else await onChanged();
  }

  async function renameLevel(levelId: string) {
    const nextName = editingLevelName.trim();
    if (!nextName) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/levels/${levelId}`, {
      method: "PATCH",
      json: { name: nextName },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not rename level");
    else {
      setEditingLevelId(null);
      setEditingLevelName("");
      await onChanged();
    }
  }

  async function renameSubject() {
    const nextName = editingSubjectName.trim();
    if (!nextName) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/subjects/${subject.id}`, {
      method: "PATCH",
      json: {
        name: nextName,
        code: editingSubjectCode.trim() || null,
        areaId: editingAreaId || null,
        testMode: editingTestMode,
        ...(editingTestMode === "CHAPTER"
          ? { chapterTestQuestionCount: Math.max(1, parseInt(editingQuestionCount, 10) || 10) }
          : {}),
      },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not rename branch");
    else {
      setEditingSubject(false);
      await onChanged();
    }
  }

  return (
    <details className="rounded-lg border border-slate-200 open:shadow-sm group bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-slate-900 flex justify-between items-center hover:bg-slate-50 rounded-lg">
        <span>
          {subject.name}
          {subject.code ? <span className="text-slate-500 font-normal ml-2">({subject.code})</span> : null}
          {subject.testMode === "CHAPTER" ? (
            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
              chapters
            </span>
          ) : (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              levels
            </span>
          )}
          {subject.area ? (
            <span className="ml-2 text-xs font-normal text-slate-500">· {subject.area.name}</span>
          ) : (
            <span className="ml-2 text-xs font-normal text-amber-700">· no subject</span>
          )}
        </span>
        <span className="inline-flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingSubject(true);
              setEditingSubjectName(subject.name);
              setEditingSubjectCode(subject.code ?? "");
              setEditingAreaId(subject.areaId ?? "");
              setEditingTestMode(subject.testMode ?? "LEVEL");
              setEditingQuestionCount(String(subject.chapterTestQuestionCount ?? 10));
            }}
            className="text-xs rounded border border-slate-300 text-slate-700 px-2 py-1 disabled:opacity-50"
          >
            Rename branch
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              requestConfirm({
                title: "Delete branch permanently",
                message: `This will permanently delete branch "${subject.name}" and all its levels, topics, questions, and student history. This cannot be undone.`,
                requireTypedText: subject.name,
                confirmLabel: "Delete branch",
                onConfirm: () => removeSubject(true),
              });
            }}
            className="text-xs rounded border border-rose-500 bg-white text-rose-800 px-2 py-1 disabled:opacity-50"
          >
            Delete branch
          </button>
          <span className="text-slate-400 text-sm group-open:hidden">Expand</span>
          <span className="text-slate-400 text-sm hidden group-open:inline">Collapse</span>
        </span>
      </summary>
      <div className="px-4 pb-4 pt-0 border-t border-slate-100">
        {editingSubject ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-wrap gap-2 items-end">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Branch name</span>
              <input
                className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[200px]"
                value={editingSubjectName}
                onChange={(e) => setEditingSubjectName(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Code</span>
              <input
                className="rounded border border-slate-300 px-2 py-1.5 text-sm w-28"
                value={editingSubjectCode}
                onChange={(e) => setEditingSubjectCode(e.target.value)}
                disabled={busy}
              />
            </label>
            {areas.length > 0 && (
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Subject</span>
                <select
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[140px]"
                  value={editingAreaId}
                  onChange={(e) => setEditingAreaId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Unassigned</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Test type</span>
              <select
                className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[140px]"
                value={editingTestMode}
                onChange={(e) => setEditingTestMode(e.target.value as "LEVEL" | "CHAPTER")}
                disabled={busy}
              >
                <option value="LEVEL">Levels</option>
                <option value="CHAPTER">Chapters (book)</option>
              </select>
            </label>
            {editingTestMode === "CHAPTER" ? (
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Questions per test</span>
                <input
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm w-24"
                  value={editingQuestionCount}
                  onChange={(e) => setEditingQuestionCount(e.target.value)}
                  disabled={busy}
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={busy || !editingSubjectName.trim()}
              onClick={() => void renameSubject()}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingSubject(false);
                setEditingSubjectName(subject.name);
                setEditingSubjectCode(subject.code ?? "");
                setEditingAreaId(subject.areaId ?? "");
                setEditingTestMode(subject.testMode ?? "LEVEL");
                setEditingQuestionCount(String(subject.chapterTestQuestionCount ?? 10));
              }}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : null}

        {subject.testMode === "CHAPTER" ? (
          <BranchChapterPanel
            subject={subject}
            busy={busy}
            setBusy={setBusy}
            setErr={setErr}
            onChanged={onChanged}
            requestConfirm={requestConfirm}
          />
        ) : (
          <>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setSection("learn")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              section === "learn" ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            Learn
          </button>
          <button
            type="button"
            onClick={() => setSection("test")}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              section === "test" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            Test
          </button>
        </div>

        {section === "learn" ? (
          <BranchLearnPanel subject={subject} busy={busy} setBusy={setBusy} setErr={setErr} onChanged={onChanged} />
        ) : (
          <>
        <form onSubmit={addLevel} className="mt-3 flex flex-wrap gap-2 items-end">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm flex-1 min-w-[200px]"
            placeholder="New level name (e.g. Level 1: Algebra)"
            value={levelName}
            onChange={(e) => setLevelName(e.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !levelName.trim()}
            className="rounded-lg bg-slate-800 text-white px-3 py-2 text-sm disabled:opacity-50"
          >
            Add level
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          New levels get a default test size of 8 questions. Add chapters below, then choose which chapters feed each
          level test and upload or enter questions for those chapter and level pairs.
        </p>

        <ol className="mt-4 space-y-4">
          {subject.levels.map((lvl) => {
            const topicsInLevel = topicsByLevelId.get(lvl.id) ?? NO_TOPICS;
            return (
              <li key={lvl.id} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="flex flex-wrap gap-2 justify-between items-start">
                  <div>
                    {editingLevelId === lvl.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="rounded border border-slate-300 px-2 py-1 text-sm"
                          value={editingLevelName}
                          onChange={(e) => setEditingLevelName(e.target.value)}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          className="text-xs rounded border border-slate-300 px-2 py-1"
                          disabled={busy || !editingLevelName.trim()}
                          onClick={() => void renameLevel(lvl.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="text-xs rounded border border-slate-300 px-2 py-1"
                          disabled={busy}
                          onClick={() => {
                            setEditingLevelId(null);
                            setEditingLevelName("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-slate-800">{lvl.name}</span>
                    )}
                    <span className="text-slate-500 text-sm ml-2">order {lvl.order}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {editingLevelId !== lvl.id ? (
                      <button
                        type="button"
                        className="text-sm text-slate-700 font-medium underline"
                        onClick={() => {
                          setEditingLevelId(lvl.id);
                          setEditingLevelName(lvl.name);
                        }}
                      >
                        Rename
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-sm text-indigo-700 font-medium"
                      onClick={() => setOpenLevelId((id) => (id === lvl.id ? null : lvl.id))}
                    >
                      {openLevelId === lvl.id ? "Hide test setup" : "Chapters & test setup"}
                    </button>
                    <button
                      type="button"
                      className="text-sm text-rose-800 font-medium"
                      disabled={busy}
                      onClick={() => {
                        requestConfirm({
                          title: "Delete level permanently",
                          message: `This will permanently delete level "${lvl.name}" and all its chapters, questions, and student history. This cannot be undone.`,
                          requireTypedText: lvl.name,
                          confirmLabel: "Delete level",
                          onConfirm: () => removeLevel(lvl.id, true),
                        });
                      }}
                    >
                      Delete level
                    </button>
                  </div>
                </div>
                {openLevelId === lvl.id ? (
                  <LevelDetail
                    subjectId={subject.id}
                    level={lvl}
                    topicsInLevel={topicsInLevel}
                    busy={busy}
                    setBusy={setBusy}
                    setErr={setErr}
                    onChanged={onChanged}
                    requestConfirm={requestConfirm}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
          </>
        )}
          </>
        )}
      </div>
    </details>
  );
}

function BranchChapterPanel({
  subject,
  busy,
  setBusy,
  setErr,
  onChanged,
  requestConfirm,
}: {
  subject: CurriculumSubject;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  onChanged: () => Promise<void>;
  requestConfirm: RequestConfirm;
}) {
  const [chapterName, setChapterName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [qCount, setQCount] = useState(String(subject.chapterTestQuestionCount ?? 10));
  const [negativeMarking, setNegativeMarking] = useState(Boolean(subject.chapterNegativeMarking));
  const [penalty, setPenalty] = useState(String(subject.chapterWrongPenalty ?? 0.25));

  useEffect(() => {
    setQCount(String(subject.chapterTestQuestionCount ?? 10));
    setNegativeMarking(Boolean(subject.chapterNegativeMarking));
    setPenalty(String(subject.chapterWrongPenalty ?? 0.25));
  }, [subject.chapterTestQuestionCount, subject.chapterNegativeMarking, subject.chapterWrongPenalty]);

  const chapters = subject.chapters ?? [];

  async function addChapter(e: React.FormEvent) {
    e.preventDefault();
    if (!chapterName.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/subjects/${subject.id}/topics`, {
      method: "POST",
      json: { name: chapterName.trim() },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not add chapter");
    else {
      setChapterName("");
      await onChanged();
    }
  }

  async function saveQuestionCount() {
    const n = parseInt(qCount, 10);
    if (!Number.isFinite(n) || n < 1) {
      setErr("Question count must be a positive number");
      return;
    }
    const p = parseFloat(penalty);
    if (negativeMarking && (!Number.isFinite(p) || p < 0 || p > 1)) {
      setErr("Wrong-answer penalty must be between 0 and 1 (for example 0.25).");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/subjects/${subject.id}`, {
      method: "PATCH",
      json: {
        chapterTestQuestionCount: n,
        chapterNegativeMarking: negativeMarking,
        chapterWrongPenalty: Number.isFinite(p) ? p : 0.25,
      },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not save test size");
    else await onChanged();
  }

  async function renameChapter(topicId: string) {
    const next = editingName.trim();
    if (!next) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/topics/${topicId}`, {
      method: "PATCH",
      json: { name: next },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not rename chapter");
    else {
      setEditingId(null);
      await onChanged();
    }
  }

  function removeChapter(ch: CurriculumChapter) {
    requestConfirm({
      title: "Remove chapter",
      message: `Remove chapter "${ch.name}" from this book branch? Questions stay in the bank and will show again if you re-add the same chapter name.`,
      confirmLabel: "Remove chapter",
      onConfirm: () => doRemoveChapter(ch.id),
    });
  }

  async function doRemoveChapter(topicId: string) {
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/subjects/${subject.id}/chapters/${topicId}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not remove chapter");
    else await onChanged();
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-600">
        Students tick this branch, then tick one or more chapters, then take a test from those chapters only. No
        levels. Add questions in the Question bank after selecting this branch and chapter.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Questions per test</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-24"
            value={qCount}
            onChange={(e) => setQCount(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input
            type="checkbox"
            checked={negativeMarking}
            onChange={(e) => setNegativeMarking(e.target.checked)}
            disabled={busy}
          />
          Negative marking
        </label>
        {negativeMarking ? (
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Penalty per wrong</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-24"
              value={penalty}
              onChange={(e) => setPenalty(e.target.value)}
              disabled={busy}
              placeholder="0.25"
            />
          </label>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveQuestionCount()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          Save test rules
        </button>
      </div>
      {negativeMarking ? (
        <p className="mt-2 text-xs text-slate-500">
          Correct = +1, wrong = −{penalty || "0.25"}. Marks can go below 0; percentage stays at 0%. Students must still answer every
          question. Level tests are not affected.
        </p>
      ) : null}
      <p className="mt-4 text-sm font-medium text-slate-700">Chapters</p>
      <ul className="mt-2 space-y-2">
        {chapters.length === 0 ? (
          <li className="text-sm text-amber-800">No chapters yet — add one below.</li>
        ) : (
          chapters.map((ch) => (
            <li key={ch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {editingId === ch.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="text-xs rounded border border-slate-300 px-2 py-1"
                    disabled={busy || !editingName.trim()}
                    onClick={() => void renameChapter(ch.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-xs rounded border border-slate-300 px-2 py-1"
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span className="font-medium text-slate-800">{ch.name}</span>
              )}
              {editingId !== ch.id ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="text-sm text-slate-700 font-medium underline"
                    onClick={() => {
                      setEditingId(ch.id);
                      setEditingName(ch.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="text-sm text-rose-800 font-medium"
                    disabled={busy}
                    onClick={() => removeChapter(ch)}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
      <form onSubmit={addChapter} className="mt-3 flex flex-wrap gap-2">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm flex-1 min-w-[200px]"
          placeholder="New chapter name (e.g. Knowing Our Numbers)"
          value={chapterName}
          onChange={(e) => setChapterName(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !chapterName.trim()}
          className="rounded-lg bg-slate-800 text-white px-3 py-2 text-sm disabled:opacity-50"
        >
          Add chapter
        </button>
      </form>
    </div>
  );
}

function BranchLearnPanel({
  subject,
  busy,
  setBusy,
  setErr,
  onChanged,
}: {
  subject: CurriculumSubject;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const topics = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const t of subject.topics ?? []) {
      map.set(t.id, { id: t.id, name: t.name });
    }
    for (const lvl of subject.levels) {
      for (const p of lvl.levelTopicParticipations) {
        map.set(p.topic.id, p.topic);
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [subject]);

  const [lessons, setLessons] = useState<
    Record<string, { title: string; body: string } | null>
  >({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    void (async () => {
      const next: Record<string, { title: string; body: string } | null> = {};
      await Promise.all(
        topics.map(async (t) => {
          const r = await api<{
            lesson: { title: string; body: string } | null;
          }>(`/api/v1/admin/topics/${t.id}/lesson`);
          next[t.id] = r.ok ? r.data?.lesson ?? null : null;
        })
      );
      setLessons(next);
    })();
  }, [topics]);

  async function saveLesson(topicId: string, topicName: string) {
    if (!title.trim() || !body.trim()) {
      setErr("Lesson title and body are required");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/topics/${topicId}/lesson`, {
      method: "PUT",
      json: {
        title: title.trim() || `Learn: ${topicName}`,
        body: body.trim(),
      },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not save lesson");
    else {
      setEditingId(null);
      await onChanged();
      setLessons((prev) => ({
        ...prev,
        [topicId]: { title: title.trim(), body: body.trim() },
      }));
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-600">
        Write short lessons for topics in this branch. Students see these in Learn / Fix these topics.
      </p>
      {topics.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No topics yet. Open Test, add levels and topics, then come back to Learn.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {topics.map((t) => {
            const lesson = lessons[t.id];
            const editing = editingId === t.id;
            return (
              <li key={t.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">
                      {lesson ? `Lesson: ${lesson.title}` : "No lesson yet"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs rounded border border-slate-300 bg-white px-2 py-1"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(t.id);
                      setTitle(lesson?.title ?? `Learn: ${t.name}`);
                      setBody(
                        lesson?.body ??
                          `Key points for ${t.name}:\n\n1. ...\n2. ...\n3. ...`
                      );
                    }}
                  >
                    {lesson ? "Edit lesson" : "Add lesson"}
                  </button>
                </div>
                {editing && (
                  <div className="mt-3 space-y-2">
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={busy}
                    />
                    <textarea
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
                      rows={8}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      disabled={busy}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveLesson(t.id, t.name)}
                        className="rounded bg-indigo-600 text-white px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Save lesson
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LevelDetail({
  subjectId,
  level,
  topicsInLevel,
  busy,
  setBusy,
  setErr,
  onChanged,
  requestConfirm,
}: {
  subjectId: string;
  level: CurriculumLevel;
  topicsInLevel: CurriculumTopic[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  onChanged: () => Promise<void>;
  requestConfirm: RequestConfirm;
}) {
  const [topicName, setTopicName] = useState("");
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicName, setEditingTopicName] = useState("");
  const [qCount, setQCount] = useState(String(level.testConfig?.questionCount ?? 8));
  const [partRows, setPartRows] = useState(() => buildPartRows(level, topicsInLevel));

  const partSig = level.levelTopicParticipations.map((p) => `${p.topicId}:${p.quota ?? ""}`).join("|");
  const topicIdsSig = topicsInLevel.map((t) => t.id).join(",");

  useEffect(() => {
    setQCount(String(level.testConfig?.questionCount ?? 8));
    setPartRows(buildPartRows(level, topicsInLevel));
  }, [level, partSig, topicIdsSig, topicsInLevel]);

  async function addTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!topicName.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/subjects/${subjectId}/topics`, {
      method: "POST",
      json: { name: topicName.trim(), levelId: level.id },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not add chapter");
    else {
      setTopicName("");
      await onChanged();
    }
  }

  async function saveTestConfig() {
    const n = parseInt(qCount, 10);
    if (!Number.isFinite(n) || n < 1) {
      setErr("Question count must be a positive number");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/levels/${level.id}/test-config`, {
      method: "PUT",
      json: { questionCount: n },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Save failed");
    else await onChanged();
  }

  async function saveParticipation() {
    const selected = partRows.filter((r) => r.included);
    if (selected.length === 0) {
      setErr("Select at least one chapter for this level test.");
      return;
    }
    const body = selected.map((r, i) => {
      const raw = r.quota;
      const q =
        raw === "" || raw === null || raw === undefined
          ? null
          : typeof raw === "number"
            ? raw
            : parseInt(String(raw), 10);
      return { topicId: r.topicId, quota: q, sortOrder: i };
    });
    for (const row of body) {
      if (row.quota !== null && (!Number.isFinite(row.quota) || row.quota < 1)) {
        setErr("Quotas must be positive integers or left empty for even split.");
        return;
      }
    }
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/levels/${level.id}/topics`, {
      method: "PUT",
      json: body,
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Save failed");
    else await onChanged();
  }

  async function renameTopic(topicId: string) {
    const nextName = editingTopicName.trim();
    if (!nextName) return;
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/topics/${topicId}`, {
      method: "PATCH",
      json: { name: nextName },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not rename chapter");
    else {
      setEditingTopicId(null);
      setEditingTopicName("");
      await onChanged();
    }
  }


  function toggleTopic(topicId: string, on: boolean) {
    setPartRows((rows) => rows.map((r) => (r.topicId === topicId ? { ...r, included: on } : r)));
  }

  function deleteTopic(topic: CurriculumTopic) {
    requestConfirm({
      title: "Delete chapter permanently",
      message: `This will permanently delete chapter "${topic.name}" and all its questions plus any student history. This cannot be undone.`,
      requireTypedText: topic.name,
      confirmLabel: "Delete chapter",
      onConfirm: async () => {
        setBusy(true);
        setErr(null);
        const r = await api(`/api/v1/admin/topics/${topic.id}?force=1`, { method: "DELETE" });
        setBusy(false);
        if (!r.ok) setErr(r.error ?? "Could not delete chapter");
        else await onChanged();
      },
    });
  }

  return (
    <div className="mt-3 space-y-4 border-t border-slate-200 pt-3">
      <div>
        <p className="text-sm font-medium text-slate-700">Chapters in this level</p>
        <ul className="mt-1 text-sm text-slate-600 list-disc list-inside">
          {topicsInLevel.length ? (
            topicsInLevel.map((t) => (
              <li key={t.id} className="list-none">
                <div className="inline-flex items-center gap-2">
                  {editingTopicId === t.id ? (
                    <>
                      <input
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        value={editingTopicName}
                        onChange={(e) => setEditingTopicName(e.target.value)}
                        disabled={busy}
                      />
                      <button
                        type="button"
                        className="text-xs rounded border border-slate-300 text-slate-700 px-2 py-0.5"
                        disabled={busy || !editingTopicName.trim()}
                        onClick={() => void renameTopic(t.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="text-xs rounded border border-slate-300 text-slate-700 px-2 py-0.5"
                        disabled={busy}
                        onClick={() => {
                          setEditingTopicId(null);
                          setEditingTopicName("");
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span>{t.name}</span>
                      <button
                        type="button"
                        className="text-xs rounded border border-slate-300 text-slate-700 px-2 py-0.5"
                        disabled={busy}
                        onClick={() => {
                          setEditingTopicId(t.id);
                          setEditingTopicName(t.name);
                        }}
                      >
                        Rename
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="text-xs rounded border border-slate-300 text-slate-700 px-2 py-0.5"
                    disabled={busy}
                    onClick={() => toggleTopic(t.id, false)}
                  >
                    Remove from level
                  </button>
                  <button
                    type="button"
                    className="text-xs rounded border border-rose-300 bg-white text-rose-700 px-2 py-0.5 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => deleteTopic(t)}
                    title="Delete chapter from the database"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))
          ) : (
            <li className="list-none text-amber-800">No chapters yet — add one below.</li>
          )}
        </ul>
        <form onSubmit={addTopic} className="mt-2 flex flex-wrap gap-2">
          <input
            className="rounded border border-slate-300 px-2 py-1.5 text-sm flex-1 min-w-[160px]"
            placeholder="New chapter name"
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !topicName.trim()}
            className="rounded bg-white border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Add chapter
          </button>
        </form>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">Level test</p>
        <div className="mt-1 flex flex-wrap gap-2 items-center">
          <label className="text-sm text-slate-600">
            Questions per attempt
            <input
              type="number"
              min={1}
              className="ml-2 w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              value={qCount}
              onChange={(e) => setQCount(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveTestConfig()}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm"
          >
            Save count
          </button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">Which chapters supply questions</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Leave quota blank to split questions evenly across selected chapters. Questions in the bank must match this level and chapter.
        </p>
        <ul className="mt-2 space-y-2">
          {partRows.map((row) => {
            const t = topicsInLevel.find((x) => x.id === row.topicId);
            return (
              <li key={row.topicId} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.included}
                    disabled={busy}
                    onChange={(e) => toggleTopic(row.topicId, e.target.checked)}
                  />
                  <span>{t?.name ?? row.topicId}</span>
                </label>
                {row.included ? (
                  <label className="text-xs text-slate-500 inline-flex items-center gap-1">
                    Quota
                    <input
                      className="w-16 rounded border border-slate-300 px-1 py-0.5"
                      placeholder="auto"
                      value={row.quota === null || row.quota === "" ? "" : String(row.quota)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPartRows((rows) =>
                          rows.map((r) =>
                            r.topicId === row.topicId
                              ? { ...r, quota: v === "" ? "" : parseInt(v, 10) || "" }
                              : r
                          )
                        );
                      }}
                      disabled={busy}
                    />
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>
        {partRows.length === 0 ? (
          <p className="text-sm text-slate-500 mt-2">Add at least one chapter to this level first.</p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveParticipation()}
            className="mt-3 rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Save chapter mix
          </button>
        )}
      </div>
    </div>
  );
}

type PartRow = { topicId: string; included: boolean; quota: number | "" | null };

function buildPartRows(level: CurriculumLevel, topicsInLevel: CurriculumTopic[]): PartRow[] {
  const existing = level.levelTopicParticipations;
  if (existing.length) {
    const ids = new Set(existing.map((e) => e.topicId));
    const rows: PartRow[] = existing.map((e) => ({
      topicId: e.topicId,
      included: true,
      quota: e.quota ?? "",
    }));
    for (const t of topicsInLevel) {
      if (!ids.has(t.id)) rows.push({ topicId: t.id, included: false, quota: "" });
    }
    return rows;
  }
  return topicsInLevel.map((t) => ({ topicId: t.id, included: false, quota: "" as const }));
}
