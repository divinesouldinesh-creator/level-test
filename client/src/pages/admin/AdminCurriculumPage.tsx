import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";

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
  levelId: string | null;
};
type CurriculumSubject = {
  id: string;
  name: string;
  code: string | null;
  levels: CurriculumLevel[];
  topics: CurriculumTopic[];
};

const NO_TOPICS: CurriculumTopic[] = [];

export function AdminCurriculumPage() {
  const [classes, setClasses] = useState<SchoolClassMeta[]>([]);
  const [subjects, setSubjects] = useState<CurriculumSubject[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setErr(null);
    const [c, s] = await Promise.all([
      api<SchoolClassMeta[]>("/api/v1/admin/classes"),
      api<CurriculumSubject[]>("/api/v1/admin/subjects"),
    ]);
    if (!c.ok) setErr(c.error ?? "Failed to load classes");
    else if (c.data) setClasses(c.data);
    if (!s.ok) setErr(s.error ?? "Failed to load subjects");
    else if (s.data) setSubjects(s.data);
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
        Create school classes and sections, assign subjects to each class, then define subjects, levels, chapters
        (topics), and how each level test draws questions from those chapters. Students only see subjects linked to
        their class.
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
          />
          <SubjectsPanel subjects={subjects} busy={busy} setBusy={setBusy} setErr={setErr} onChanged={refresh} />
        </div>
      )}
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
}: {
  classes: SchoolClassMeta[];
  subjectOptions: { id: string; label: string }[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  onChanged: () => Promise<void>;
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

  async function unlinkSubject(classId: string, subjectId: string) {
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/classes/${classId}/subjects/${subjectId}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not remove subject");
    else await onChanged();
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
                        onClick={() => void unlinkSubject(c.id, cs.subject.id)}
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

function SubjectsPanel({
  subjects,
  busy,
  setBusy,
  setErr,
  onChanged,
}: {
  subjects: CurriculumSubject[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [subName, setSubName] = useState("");
  const [subCode, setSubCode] = useState("");

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!subName.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await api("/api/v1/admin/subjects", {
      method: "POST",
      json: { name: subName.trim(), code: subCode.trim() || undefined },
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not create subject");
    else {
      setSubName("");
      setSubCode("");
      await onChanged();
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-lg text-slate-900">Subjects, levels &amp; tests</h2>
      <form onSubmit={addSubject} className="mt-4 flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Subject name</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-base min-w-[200px]"
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            placeholder="e.g. Science"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Code (optional)</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 w-28 text-base"
            value={subCode}
            onChange={(e) => setSubCode(e.target.value)}
            placeholder="SCI"
            disabled={busy}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !subName.trim()}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add subject
        </button>
      </form>

      <div className="mt-6 space-y-4">
        {subjects.map((su) => (
          <SubjectCard key={su.id} subject={su} busy={busy} setBusy={setBusy} setErr={setErr} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function SubjectCard({
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
  const [levelName, setLevelName] = useState("");
  const [openLevelId, setOpenLevelId] = useState<string | null>(null);

  const topicsByLevelId = useMemo(() => {
    const m = new Map<string, CurriculumTopic[]>();
    for (const t of subject.topics) {
      if (!t.levelId) continue;
      const arr = m.get(t.levelId);
      if (arr) arr.push(t);
      else m.set(t.levelId, [t]);
    }
    return m;
  }, [subject.topics]);

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

  return (
    <details className="rounded-lg border border-slate-200 open:shadow-sm group">
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-slate-900 flex justify-between items-center hover:bg-slate-50 rounded-lg">
        <span>
          {subject.name}
          {subject.code ? <span className="text-slate-500 font-normal ml-2">({subject.code})</span> : null}
        </span>
        <span className="text-slate-400 text-sm group-open:hidden">Expand</span>
        <span className="text-slate-400 text-sm hidden group-open:inline">Collapse</span>
      </summary>
      <div className="px-4 pb-4 pt-0 border-t border-slate-100">
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
                    <span className="font-medium text-slate-800">{lvl.name}</span>
                    <span className="text-slate-500 text-sm ml-2">order {lvl.order}</span>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-indigo-700 font-medium"
                    onClick={() => setOpenLevelId((id) => (id === lvl.id ? null : lvl.id))}
                  >
                    {openLevelId === lvl.id ? "Hide test setup" : "Chapters & test setup"}
                  </button>
                </div>
                {openLevelId === lvl.id ? (
                  <LevelDetail
                    subjectId={subject.id}
                    subjectTopics={subject.topics}
                    level={lvl}
                    topicsInLevel={topicsInLevel}
                    busy={busy}
                    setBusy={setBusy}
                    setErr={setErr}
                    onChanged={onChanged}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}

function LevelDetail({
  subjectId,
  subjectTopics,
  level,
  topicsInLevel,
  busy,
  setBusy,
  setErr,
  onChanged,
}: {
  subjectId: string;
  subjectTopics: CurriculumTopic[];
  level: CurriculumLevel;
  topicsInLevel: CurriculumTopic[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setErr: (e: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [topicName, setTopicName] = useState("");
  const [qCount, setQCount] = useState(String(level.testConfig?.questionCount ?? 8));
  const [partRows, setPartRows] = useState(() =>
    buildPartRows(level, topicsInLevel)
  );

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

  function toggleTopic(topicId: string, on: boolean) {
    setPartRows((rows) => rows.map((r) => (r.topicId === topicId ? { ...r, included: on } : r)));
  }

  return (
    <div className="mt-3 space-y-4 border-t border-slate-200 pt-3">
      <div>
        <p className="text-sm font-medium text-slate-700">Chapters in this level</p>
        <ul className="mt-1 text-sm text-slate-600 list-disc list-inside">
          {topicsInLevel.length ? (
            topicsInLevel.map((t) => <li key={t.id}>{t.name}</li>)
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
          Leave quota blank to split questions evenly across selected chapters. Questions in the bank must match this
          level and chapter.
        </p>
        <ul className="mt-2 space-y-2">
          {partRows.map((row) => {
            const t = subjectTopics.find((x) => x.id === row.topicId);
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
  return topicsInLevel.map((t) => ({ topicId: t.id, included: true, quota: "" as const }));
}
