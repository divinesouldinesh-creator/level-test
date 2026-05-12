import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";

type Subject = { id: string; name: string; code: string | null; chapterCount: number };

export function SyllabusSubjects() {
  const { logout, auth } = useAuth();
  const [items, setItems] = useState<Subject[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const headerTitle =
    [auth.profile?.fullName, auth.profile?.className].filter(Boolean).join(" - ") || "Student";

  useEffect(() => {
    void (async () => {
      const r = await api<Subject[]>("/api/v1/student/syllabus/subjects");
      setLoading(false);
      if (!r.ok) setErr(r.error ?? "Failed to load");
      else setItems(r.data ?? []);
    })();
  }, []);

  return (
    <AppShell
      title={headerTitle}
      onLogout={logout}
      nav={[
        { to: "/student", label: "Skill subjects" },
        { to: "/student/syllabus", label: "Syllabus" },
        { to: "/student/attendance", label: "Attendance" },
      ]}
    >
      <Link to="/student" className="text-brand-600 text-sm font-medium">
        ← Skill subjects
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Syllabus</h1>
      <p className="mt-1 text-slate-600">
        Open a subject, select the chapters you want, then answer questions from the bank. This does
        not affect your skill scores.
      </p>
      {err && <p className="mt-3 text-rose-700">{err}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No syllabus subjects available for your class yet. Ask your teacher / admin to add one.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {items.map((s) => (
            <li key={s.id}>
              <Link
                to={`/student/syllabus/subject/${s.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-500 hover:shadow-md transition min-h-[88px]"
              >
                <span className="font-semibold text-lg text-indigo-900">{s.name}</span>
                <p className="text-sm text-slate-500 mt-1">
                  {s.chapterCount} chapter{s.chapterCount === 1 ? "" : "s"}
                  {s.code ? ` · ${s.code}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
