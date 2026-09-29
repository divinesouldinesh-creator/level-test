import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../../api";

type ClassRow = { id: string };

const shortcuts = [
  {
    to: "/office/fees?tab=collect",
    title: "Collect",
    body: "Search a child and record the amount received.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
    bodyClass: "text-emerald-800",
  },
  {
    to: "/office/fees?tab=account",
    title: "Account",
    body: "Find a child and add a sibling if there is one.",
    className: "border-sky-200 bg-sky-50 text-sky-900",
    bodyClass: "text-sky-800",
  },
  {
    to: "/office/students",
    title: "Students",
    body: "Search the list, print cards, and update names or passwords.",
    className: "border-slate-200 bg-white text-slate-900",
    bodyClass: "text-slate-600",
  },
  {
    to: "/office/attendance",
    title: "Attendance",
    body: "School attendance. Open a class to see student names.",
    className: "border-indigo-200 bg-indigo-50 text-indigo-900",
    bodyClass: "text-indigo-800",
  },
  {
    to: "/office/teachers",
    title: "Teachers",
    body: "Teacher accounts for the school.",
    className: "border-slate-200 bg-white text-slate-900",
    bodyClass: "text-slate-600",
  },
  {
    to: "/office/transport",
    title: "Transport",
    body: "Diesel for each bus. Separate from the student transport fee.",
    className: "border-slate-200 bg-white text-slate-900",
    bodyClass: "text-slate-600",
  },
] as const;

export function OfficeOverviewPage() {
  const [classCount, setClassCount] = useState<number | null>(null);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [classes, students] = await Promise.all([
        api<ClassRow[]>("/api/v1/admin/classes"),
        api<{ total: number }>("/api/v1/admin/students?page=1&pageSize=1"),
      ]);
      if (!classes.ok || !students.ok) {
        setErr(classes.error ?? students.error ?? "Could not load the office summary");
        return;
      }
      setClassCount(classes.data?.length ?? 0);
      setStudentCount(students.data?.total ?? 0);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Office overview</h1>
      <p className="text-slate-600 mt-1">Simple daily workflow for the front desk.</p>
      {err ? <p className="text-red-600 mt-3">{err}</p> : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Classes</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{classCount ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Students</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{studentCount ?? "—"}</p>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        {shortcuts.map((item) => (
          <Link key={item.to} to={item.to} className={`rounded-xl border p-4 shadow-sm block ${item.className}`}>
            <p className="font-semibold">{item.title}</p>
            <p className={`text-sm mt-1 ${item.bodyClass}`}>{item.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
