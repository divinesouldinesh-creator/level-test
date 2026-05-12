import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";

type ChapterRow = {
  id: string;
  name: string;
  order: number;
  questionCount: number;
};

type Difficulty = "EASY" | "MEDIUM" | "HARD";

export function SyllabusChapterPractice() {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const { logout, auth } = useAuth();
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [err, setErr] = useState<string | null>(null);
  const [warning, setWarning] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!subjectId) return;
    void (async () => {
      const r = await api<ChapterRow[]>(
        `/api/v1/student/syllabus/subjects/${subjectId}/chapters`
      );
      setLoading(false);
      if (!r.ok) setErr(r.error ?? "Failed to load");
      else setChapters(r.data ?? []);
    })();
  }, [subjectId]);

  const totalAvailable = useMemo(
    () => chapters.filter((c) => picked.has(c.id)).reduce((acc, c) => acc + c.questionCount, 0),
    [chapters, picked]
  );

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function startPractice() {
    if (picked.size === 0) {
      setErr("Pick at least one chapter.");
      return;
    }
    setErr(null);
    setWarning([]);
    setStarting(true);
    const r = await api<{
      testId: string;
      questionCount: number;
      requestedCount: number;
      warnings: string[];
    }>("/api/v1/student/syllabus/tests/start", {
      method: "POST",
      json: {
        syllabusSubjectId: subjectId,
        chapterIds: [...picked],
        difficulty,
      },
    });
    setStarting(false);
    if (!r.ok || !r.data?.testId) {
      setErr(r.error ?? "Could not start");
      return;
    }
    if (r.data.warnings?.length) setWarning(r.data.warnings);
    navigate(`/student/syllabus/practice/${r.data.testId}`);
  }

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Student"}
      onLogout={logout}
      nav={[
        { to: "/student", label: "Skill subjects" },
        { to: "/student/syllabus", label: "Syllabus" },
      ]}
    >
      <Link to="/student/syllabus" className="text-brand-600 text-sm font-medium">
        ← Subjects
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Choose chapters</h1>
      <p className="mt-1 text-slate-600">
        Select one or more chapters, pick Easy / Medium / Hard, then start. Questions match that
        difficulty (with nearby levels if the bank is short).
      </p>
      {err && <p className="mt-3 text-rose-700">{err}</p>}
      {warning.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Note:</p>
          <ul className="list-disc list-inside">
            {warning.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : chapters.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No chapters configured for this subject yet.
        </p>
      ) : (
        <>
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-slate-900">Chapters</p>
              <p className="text-xs text-slate-500">
                {picked.size} selected · {totalAvailable} questions in pool
              </p>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {chapters.map((c) => {
                const isOn = picked.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => togglePick(c.id)}
                      className={`w-full text-left rounded-lg border px-3 py-3 min-h-[64px] transition ${
                        isOn
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-indigo-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span
                          className={`text-xs rounded-full px-2 py-0.5 ${
                            isOn ? "bg-indigo-200 text-indigo-900" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {c.questionCount} q
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-900">Difficulty</p>
            <div className="mt-3 inline-flex rounded-lg border border-slate-300 overflow-hidden">
              {(["EASY", "MEDIUM", "HARD"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`px-4 py-2 text-sm font-medium ${
                    difficulty === d
                      ? d === "EASY"
                        ? "bg-emerald-100 text-emerald-900"
                        : d === "MEDIUM"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-rose-100 text-rose-900"
                      : "bg-white text-slate-700"
                  }`}
                >
                  {d.charAt(0) + d.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => void startPractice()}
              disabled={starting || picked.size === 0}
              className="rounded-xl bg-indigo-600 text-white px-6 py-4 text-base font-semibold min-h-[52px] disabled:opacity-50"
            >
              {starting ? "Starting…" : "Start"}
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}
