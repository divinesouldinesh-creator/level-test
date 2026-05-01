import { useEffect, useState } from "react";
import { api } from "../../../api";
import type { StudentPreviewRow } from "./types";

type SchoolClass = {
  id: string;
  name: string;
  grade: string | null;
  sections: { id: string; name: string }[];
};

export function AutoGenerateForm({
  onGenerated,
  busy,
}: {
  onGenerated: (rows: StudentPreviewRow[]) => void;
  busy: boolean;
}) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [count, setCount] = useState(10);
  const [namesText, setNamesText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loadingClasses, setLoadingClasses] = useState(true);

  useEffect(() => {
    void (async () => {
      const r = await api<SchoolClass[]>("/api/v1/admin/classes");
      setLoadingClasses(false);
      if (r.ok && r.data) {
        setClasses(r.data);
        if (r.data[0]) {
          setClassId(r.data[0].id);
          setSectionId(r.data[0].sections[0]?.id ?? "");
        }
      }
    })();
  }, []);

  const selectedClass = classes.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];

  useEffect(() => {
    if (sections.length && !sections.find((s) => s.id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [classId, sections, sectionId]);

  async function generate() {
    setErr(null);
    if (!classId || !sectionId) {
      setErr("Select a class and section.");
      return;
    }
    const r = await api<{ students: StudentPreviewRow[] }>("/api/v1/admin/generate-students", {
      method: "POST",
      json: { classId, sectionId, count },
    });
    if (!r.ok) {
      setErr((r.data as { error?: string })?.error ?? r.error ?? "Generate failed");
      return;
    }
    const students = r.data?.students ?? [];
    const lines = namesText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length > 0) {
      if (lines.length !== students.length) {
        setErr(
          `Student names: enter exactly ${students.length} non-empty lines (one name per student), or clear the box to use "Student 1", …`
        );
        return;
      }
      onGenerated(students.map((s, i) => ({ ...s, fullName: lines[i] ?? s.fullName })));
      setNamesText("");
      return;
    }
    onGenerated(students);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Auto generate accounts</h2>
      <p className="text-sm text-slate-600">
        Usernames use class + section + index (e.g. 6A_01). Passwords are random 4-digit codes. You can paste names
        below (one per line — same count as number of students) or edit names in the preview after generating.
      </p>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Student names (optional)</span>
        <span className="block text-xs text-slate-500 mt-0.5">
          One name per line — must match the number of students exactly, or leave empty to use Student 1, Student 2,
          …
        </span>
        <textarea
          value={namesText}
          onChange={(e) => setNamesText(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal min-h-[96px]"
          placeholder={"Rahul Kumar\nPriya Singh\n…"}
          disabled={busy || loadingClasses}
        />
      </label>
      {loadingClasses ? (
        <p className="text-sm text-slate-500">Loading classes…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Class</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base min-h-[44px]"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.grade ? ` (grade ${c.grade})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Section</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base min-h-[44px]"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={!sections.length}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Number of students</span>
            <input
              type="number"
              min={1}
              max={500}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base min-h-[44px]"
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 1)}
            />
          </label>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        type="button"
        disabled={busy || loadingClasses}
        onClick={() => void generate()}
        className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50 min-h-[44px]"
      >
        {busy ? "Working…" : "Generate accounts"}
      </button>
    </div>
  );
}
