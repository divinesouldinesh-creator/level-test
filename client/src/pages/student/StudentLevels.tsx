import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";

type LevelRow = {
  id: string;
  name: string;
  order: number;
  questionCount: number | null;
  topicsConfigured: number;
  unlocked: boolean;
  lastPercentage: number | null;
};

type Subject = { id: string; name: string; code: string | null; testMode?: "LEVEL" | "CHAPTER" };

type ChapterRow = { id: string; name: string; questionCount: number };
type ChapterPayload = {
  subjectId: string;
  subjectName: string;
  questionCount: number;
  negativeMarking?: boolean;
  wrongPenalty?: number;
  chapters: ChapterRow[];
};

export function StudentLevels() {
  const { subjectId } = useParams();
  const [testMode, setTestMode] = useState<"LEVEL" | "CHAPTER" | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const { logout, auth } = useAuth();

  useEffect(() => {
    void (async () => {
      const subRes = await api<Subject[]>("/api/v1/student/subjects");
      const sub = (subRes.data ?? []).find((s) => s.id === subjectId);
      if (sub) {
        setSubjectName(sub.name);
        setTestMode(sub.testMode === "CHAPTER" ? "CHAPTER" : "LEVEL");
      } else {
        setTestMode("LEVEL");
      }
    })();
  }, [subjectId]);

  if (testMode === null) {
    return (
      <AppShell
        title={auth.profile?.fullName ?? "Student"}
        onLogout={logout}
        nav={[...studentNav]}
        sidebarKicker="Student"
      >
        <p className="text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  if (testMode === "CHAPTER") {
    return <StudentChapterPicker subjectId={subjectId} fallbackName={subjectName} />;
  }

  return (
    <StudentLevelPicker
      subjectId={subjectId}
      subjectName={subjectName}
      logout={logout}
      studentName={auth.profile?.fullName ?? "Student"}
    />
  );
}

function StudentLevelPicker({
  subjectId,
  subjectName,
  logout,
  studentName,
}: {
  subjectId: string | undefined;
  subjectName: string;
  logout: () => void;
  studentName: string;
}) {
  const navigate = useNavigate();
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const lvlRes = await api<LevelRow[]>(`/api/v1/student/subjects/${subjectId}/levels`);
      if (!lvlRes.ok) setErr(lvlRes.error ?? "Failed");
      else setLevels(lvlRes.data ?? []);
    })();
  }, [subjectId]);

  async function startLevel(levelId: string) {
    setStarting(levelId);
    setErr(null);
    const r = await api<{ testId: string; warnings?: string[] }>("/api/v1/student/tests/start", {
      method: "POST",
      json: { subjectId, levelId },
    });
    setStarting(null);
    if (!r.ok || !r.data?.testId) {
      setErr(r.error ?? "Could not start test");
      return;
    }
    navigate(`/student/test/${r.data.testId}`);
  }

  return (
    <AppShell title={studentName} onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
      <Link to={`/student/part/${subjectId}`} className="text-brand-600 text-sm font-medium">
        ← {subjectName || "Back"}
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2">Test</h1>
      <p className="mt-1 text-slate-600">
        {subjectName ? `${subjectName} — pick a level` : "Pick a level to start"}
      </p>
      {err && <p className="text-red-600 mt-2">{err}</p>}
      <ul className="mt-6 space-y-3">
        {levels.map((lv) => (
          <li
            key={lv.id}
            className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
              lv.unlocked ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100 opacity-80"
            }`}
          >
            <div>
              <p className="font-semibold text-lg">{lv.name}</p>
              <p className="text-sm text-slate-600">
                {lv.questionCount != null ? `${lv.questionCount} questions` : "—"} ·{" "}
                {lv.lastPercentage != null ? `Last: ${lv.lastPercentage.toFixed(0)}%` : "Not attempted"}
              </p>
              {!lv.unlocked && (
                <p className="text-amber-700 text-sm mt-1">
                  Unlock by scoring above 80% on the previous level.
                </p>
              )}
            </div>
            {lv.unlocked ? (
              <button
                type="button"
                disabled={starting === lv.id || (lv.topicsConfigured ?? 0) === 0}
                onClick={() => void startLevel(lv.id)}
                className="rounded-xl bg-brand-600 text-white px-6 py-4 text-base font-semibold min-h-[52px] min-w-[140px] disabled:opacity-50"
              >
                {starting === lv.id ? "Starting…" : "Start test"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}

function StudentChapterPicker({
  subjectId,
  fallbackName,
}: {
  subjectId: string | undefined;
  fallbackName: string;
}) {
  const navigate = useNavigate();
  const { logout, auth } = useAuth();
  const [payload, setPayload] = useState<ChapterPayload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await api<ChapterPayload>(`/api/v1/student/subjects/${subjectId}/chapters`);
      if (!r.ok) setErr(r.error ?? "Failed to load chapters");
      else setPayload(r.data ?? null);
    })();
  }, [subjectId]);

  const chapters = payload?.chapters ?? [];
  const allSelectable = useMemo(() => chapters.filter((c) => c.questionCount > 0), [chapters]);
  const allSelected = allSelectable.length > 0 && allSelectable.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allSelectable.map((c) => c.id)));
  }

  async function startTest() {
    const topicIds = [...selected];
    if (topicIds.length === 0) {
      setErr("Tick at least one chapter");
      return;
    }
    setStarting(true);
    setErr(null);
    const r = await api<{ testId: string; warnings?: string[] }>("/api/v1/student/tests/start", {
      method: "POST",
      json: { subjectId, topicIds },
    });
    setStarting(false);
    if (!r.ok || !r.data?.testId) {
      setErr(r.error ?? "Could not start test");
      return;
    }
    navigate(`/student/test/${r.data.testId}`);
  }

  const title = payload?.subjectName || fallbackName || "Back";

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Student"}
      onLogout={logout}
      nav={[...studentNav]}
      sidebarKicker="Student"
    >
      <Link to={`/student/subjects`} className="text-brand-600 text-sm font-medium">
        ← {title}
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2">{title}</h1>
      <p className="mt-1 text-slate-600">Tick one or more chapters, then start the test.</p>
      {payload ? (
        <p className="mt-1 text-sm text-slate-500">
          Each test has {payload.questionCount} questions from the chapters you tick. You can skip questions
          (blank = 0).
          {payload.negativeMarking && (payload.wrongPenalty ?? 0) > 0
            ? ` Wrong answers: −${payload.wrongPenalty} marks each. Marks can go below 0.`
            : ""}
        </p>
      ) : null}
      {err && <p className="text-red-600 mt-2">{err}</p>}

      {chapters.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            {allSelected ? "Clear all" : "Select all with questions"}
          </button>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {chapters.length === 0 ? (
          <li className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
            No chapters yet. Ask your teacher to add chapters and questions for this book.
          </li>
        ) : (
          chapters.map((ch) => {
            const empty = ch.questionCount === 0;
            return (
              <li key={ch.id}>
                <label
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                    empty
                      ? "border-slate-100 bg-slate-50 text-slate-400"
                      : selected.has(ch.id)
                        ? "border-brand-500 bg-brand-50"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={selected.has(ch.id)}
                    disabled={empty}
                    onChange={() => toggle(ch.id)}
                  />
                  <span className="flex-1 font-medium">{ch.name}</span>
                  <span className="text-xs text-slate-500">
                    {empty ? "No questions yet" : `${ch.questionCount} in bank`}
                  </span>
                </label>
              </li>
            );
          })
        )}
      </ul>

      <button
        type="button"
        disabled={starting || selected.size === 0}
        onClick={() => void startTest()}
        className="mt-6 rounded-xl bg-brand-600 text-white px-6 py-4 text-base font-semibold min-h-[52px] min-w-[160px] disabled:opacity-50"
      >
        {starting ? "Starting…" : "Start test"}
      </button>
    </AppShell>
  );
}
