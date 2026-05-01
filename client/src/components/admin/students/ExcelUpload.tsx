import { useState } from "react";
import { api } from "../../../api";
import type { StudentPreviewRow } from "./types";

/** Minimal CSV parser for Name,Class,Section (no quoted commas in cells). */
export function parseLocalCsv(text: string): { name: string; class: string; section: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row.");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const ni = header.indexOf("name");
  const ci = header.indexOf("class");
  const si = header.indexOf("section");
  if (ni < 0 || ci < 0 || si < 0) {
    throw new Error('Header must include columns: Name, Class, Section (any order).');
  }
  const out: { name: string; class: string; section: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((c) => c.trim());
    if (parts.length < Math.max(ni, ci, si) + 1) continue;
    const name = parts[ni];
    const cls = parts[ci];
    const sec = parts[si];
    if (!name && !cls && !sec) continue;
    if (!name || !cls || !sec) throw new Error(`Row ${i + 1}: missing Name, Class, or Section.`);
    out.push({ name, class: cls, section: sec });
  }
  if (!out.length) throw new Error("No data rows found.");
  return out;
}

export function ExcelUpload({
  onPreview,
  busy,
}: {
  onPreview: (rows: StudentPreviewRow[]) => void;
  busy: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(f: File | null) {
    setErr(null);
    setFileName(null);
    if (!f) return;
    setFileName(f.name);
    const lower = f.name.toLowerCase();

    try {
      if (lower.endsWith(".csv")) {
        const text = await f.text();
        const rows = parseLocalCsv(text);
        const r = await api<{ students: StudentPreviewRow[] }>("/api/v1/admin/upload-students", {
          method: "POST",
          json: { rows },
        });
        if (!r.ok) {
          setErr((r.data as { error?: string })?.error ?? r.error ?? "Upload failed");
          return;
        }
        onPreview(r.data?.students ?? []);
        return;
      }

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const fd = new FormData();
        fd.append("file", f);
        const token = localStorage.getItem("token");
        const base = import.meta.env.VITE_API_URL ?? "";
        const res = await fetch(`${base}/api/v1/admin/upload-students/file`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as {
          students?: StudentPreviewRow[];
          error?: string;
        };
        if (!res.ok) {
          setErr(data.error ?? res.statusText);
          return;
        }
        onPreview(data.students ?? []);
        return;
      }

      setErr("Use a .csv, .xlsx, or .xls file.");
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Upload Excel or CSV</h2>
      <p className="text-sm text-slate-600">
        Expected columns: <strong>Name</strong>, <strong>Class</strong>, <strong>Section</strong>. Class and section
        are matched to existing records or created if new.
      </p>
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        <span>Choose file</span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={busy}
          className="text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-medium file:text-brand-900"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {fileName && <p className="text-xs text-slate-500">Selected: {fileName}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
