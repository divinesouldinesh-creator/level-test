import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";

type Subject = { id: string; name: string; code: string | null };

type MasteryQueueItem = {
  masteryId: string;
  topicName: string;
  subjectId: string;
  levelName: string;
  accuracyPct: number | null;
  nextStep: "learn" | "practice" | "recheck" | "done";
};

function nextStepLabel(s: MasteryQueueItem["nextStep"]) {
  if (s === "learn") return "Learn";
  if (s === "practice") return "Practice";
  if (s === "recheck") return "Quick check";
  return "Done";
}

export function StudentPartLearnPage() {
  const { subjectId } = useParams();
  const { logout, auth } = useAuth();
  const navigate = useNavigate();
  const [subjectName, setSubjectName] = useState("");
  const [items, setItems] = useState<MasteryQueueItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [subRes, mastRes] = await Promise.all([
        api<Subject[]>("/api/v1/student/subjects"),
        api<{ items: MasteryQueueItem[] }>("/api/v1/student/mastery"),
      ]);
      setLoading(false);
      if (!subRes.ok) {
        setErr(subRes.error ?? "Failed to load");
        return;
      }
      const sub = (subRes.data ?? []).find((s) => s.id === subjectId);
      setSubjectName(sub?.name ?? "Learn");
      const items = mastRes.ok ? mastRes.data?.items ?? [] : [];
      setItems(items.filter((i) => i.subjectId === subjectId));
      setErr(null);
    })();
  }, [subjectId]);

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Student"}
      onLogout={logout}
      nav={[...studentNav]}
      sidebarKicker="Student"
    >
      <Link to={`/student/part/${subjectId}`} className="text-sm font-medium text-brand-700">
        ← {subjectName || "Back"}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Learn</h1>
      <p className="mt-1 text-slate-600">
        Practice the topics you need to improve in {subjectName || "this subject"}.
      </p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <p>No weak topics here yet.</p>
          <p className="mt-2">
            Take a{" "}
            <Link to={`/student/part/${subjectId}/test`} className="font-medium text-brand-700">
              Test
            </Link>{" "}
            first — then come back here to learn what you missed.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {items.map((m) => (
            <li key={m.masteryId}>
              <button
                type="button"
                onClick={() => navigate(`/student/mastery/${m.masteryId}`)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-white px-4 py-3 text-left shadow-sm hover:border-indigo-300"
              >
                <div>
                  <p className="font-semibold text-slate-900">{m.topicName}</p>
                  <p className="text-xs text-slate-500">
                    {m.levelName}
                    {m.accuracyPct != null ? ` · ${m.accuracyPct}%` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                  {nextStepLabel(m.nextStep)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
