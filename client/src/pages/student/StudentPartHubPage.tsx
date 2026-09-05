import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";
import type { SubjectWithArea } from "../../subjectAreas";

export function StudentPartHubPage() {
  const { subjectId } = useParams();
  const { logout, auth } = useAuth();
  const [subject, setSubject] = useState<SubjectWithArea | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<SubjectWithArea[]>("/api/v1/student/subjects");
      if (!r.ok) {
        setErr(r.error ?? "Failed to load");
        return;
      }
      const found = (r.data ?? []).find((s) => s.id === subjectId) ?? null;
      setSubject(found);
      if (!found) setErr("Subject not found");
    })();
  }, [subjectId]);

  const backTo = subject?.areaId
    ? `/student/subjects/${encodeURIComponent(subject.areaId)}`
    : "/student/subjects";

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Student"}
      onLogout={logout}
      nav={[...studentNav]}
      sidebarKicker="Student"
    >
      <Link to={backTo} className="text-sm font-medium text-brand-700">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{subject?.name ?? "…"}</h1>
      <p className="mt-1 text-slate-600">Choose Learn to study, or Test to check yourself.</p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {subject && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            to={`/student/part/${subject.id}/learn`}
            className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm hover:border-indigo-400"
          >
            <p className="text-xl font-semibold text-slate-900">Learn</p>
            <p className="mt-2 text-sm text-slate-600">
              Study weak topics and practice until you get them right.
            </p>
          </Link>
          <Link
            to={`/student/part/${subject.id}/test`}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-brand-500"
          >
            <p className="text-xl font-semibold text-slate-900">Test</p>
            <p className="mt-2 text-sm text-slate-600">
              Take level tests to check your progress.
            </p>
          </Link>
        </div>
      )}
    </AppShell>
  );
}
