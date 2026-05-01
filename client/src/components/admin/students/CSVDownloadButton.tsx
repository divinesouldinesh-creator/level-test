import { downloadCredentialsCsv } from "./credentialExport";
import type { StudentPreviewRow } from "./types";

function previewRowsToExport(rows: StudentPreviewRow[]) {
  return rows.map((r) => ({
    name: r.fullName.trim() || r.studentLoginId,
    class: r.classLabel ?? r.className,
    section: r.sectionName,
    username: r.studentLoginId,
    password: r.password,
  }));
}

export function CSVDownloadButton({
  rows,
  filename,
  label = "Download CSV",
  disabled,
}: {
  rows: StudentPreviewRow[];
  filename: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || !rows.length}
      onClick={() => downloadCredentialsCsv(previewRowsToExport(rows), filename)}
      className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 min-h-[44px]"
    >
      {label}
    </button>
  );
}
