import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";

type Subject = { id: string; name: string; code: string | null };

export function StudentSubjects() {
  const { logout, auth } = useAuth();
  const [items, setItems] = useState<Subject[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const headerTitle = [auth.profile?.fullName, auth.profile?.className].filter(Boolean).join(" - ") || "Student";

  useEffect(() => {
    void (async () => {
      const r = await api<Subject[]>("/api/v1/student/subjects");
      if (!r.ok) setErr(r.error ?? "Failed to load");
      else setItems(r.data ?? []);
    })();
  }, []);

  return (
    <AppShell
      title={headerTitle}
      onLogout={logout}
      nav={[{ to: "/student", label: "Subjects" }]}
    >
      <h1 className="text-2xl font-bold text-slate-900">Your subjects</h1>
      <p className="text-slate-600 mt-1">Choose a subject to view levels and start a test.</p>
      {err && <p className="text-red-600 mt-4">{err}</p>}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((s) => (
          <li key={s.id}>
            <Link
              to={`/student/subject/${s.id}/levels`}
              className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-500 hover:shadow-md transition min-h-[88px] flex flex-col justify-center"
            >
              <span className="font-semibold text-lg text-brand-900">{s.name}</span>
              {s.code && <span className="text-sm text-slate-500">{s.code}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
