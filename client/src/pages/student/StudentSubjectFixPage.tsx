import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";
import {
  areaLabelFromSubjects,
  subjectMatchesArea,
  type SubjectWithArea,
} from "../../subjectAreas";

type MasteryQueueItem = {
  masteryId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  levelName: string;
  status: string;
  accuracyPct: number | null;
  nextStep: "learn" | "practice" | "recheck" | "done";
};

function nextStepLabel(s: MasteryQueueItem["nextStep"]) {
  if (s === "learn") return "Learn";
  if (s === "practice") return "Practice";
  if (s === "recheck") return "Quick check";
  return "Done";
}

export function StudentSubjectFixPage() {
  const { area: areaParam } = useParams();
  const { logout, auth } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<SubjectWithArea[]>([]);
  const [items, setItems] = useState<MasteryQueueItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!areaParam) return;
    void (async () => {
      setLoading(true);
      const [subRes, mastRes] = await Promise.all([
        api<SubjectWithArea[]>("/api/v1/student/subjects"),
        api<{ items: MasteryQueueItem[] }>("/api/v1/student/mastery"),
      ]);
      setLoading(false);
      if (!subRes.ok || !mastRes.ok) {
        setErr(subRes.error ?? mastRes.error ?? "Failed to load");
        return;
      }
      const all = subRes.data ?? [];
      setSubjects(all);
      const inArea = new Set(
        all.filter((s) => subjectMatchesArea(s, areaParam)).map((s) => s.id)
      );
      setItems((mastRes.data?.items ?? []).filter((i) => inArea.has(i.subjectId)));
      setErr(null);
    })();
  }, [areaParam]);

  if (!areaParam) {
    return <Navigate to="/student/subjects" replace />;
  }

  const title = areaLabelFromSubjects(areaParam, subjects);

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Student"}
      onLogout={logout}
      nav={[...studentNav]}
      sidebarKicker="Student"
    >
      <Link
        to={`/student/subjects/${encodeURIComponent(areaParam)}`}
        className="text-sm font-medium text-brand-700"
      >
        ← {title}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Fix these topics</h1>
      <p className="mt-1 text-slate-600">Weak topics in {title} — practice until you master them.</p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          No weak topics in {title} right now. Take a Test under a subject part to find what to fix.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {items.map((m) => (
            <li key={m.masteryId}>
              <button
                type="button"
                onClick={() => navigate(`/student/mastery/${m.masteryId}`)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-100 bg-white px-4 py-3 text-left shadow-sm hover:border-rose-300"
              >
                <div>
                  <p className="font-semibold text-slate-900">{m.topicName}</p>
                  <p className="text-xs text-slate-500">
                    {m.subjectName} · {m.levelName}
                    {m.accuracyPct != null ? ` · ${m.accuracyPct}%` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white">
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
