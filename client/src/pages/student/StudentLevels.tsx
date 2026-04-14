import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";

type LevelRow = {
  id: string;
  name: string;
  order: number;
  questionCount: number | null;
  topicsConfigured: number;
  unlocked: boolean;
  lastPercentage: number | null;
};

export function StudentLevels() {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const { logout, auth } = useAuth();
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<LevelRow[]>(`/api/v1/student/subjects/${subjectId}/levels`);
      if (!r.ok) setErr(r.error ?? "Failed");
      else setLevels(r.data ?? []);
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
    <AppShell
      title={auth.profile?.fullName ?? "Student"}
      onLogout={logout}
      nav={[
        { to: "/student", label: "Subjects" },
        { to: `/student/subject/${subjectId}/levels`, label: "Levels" },
      ]}
    >
      <Link to="/student" className="text-brand-600 text-sm font-medium">
        Back to subjects
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2">Levels</h1>
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
              {!lv.unlocked && <p className="text-amber-700 text-sm mt-1">Unlock by scoring above 80% on the previous level.</p>}
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
