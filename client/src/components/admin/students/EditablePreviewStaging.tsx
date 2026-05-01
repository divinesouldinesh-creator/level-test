import { CSVDownloadButton } from "./CSVDownloadButton";
import { downloadCredentialsXlsx } from "./credentialExport";
import type { StudentPreviewRow } from "./types";
import { openPrintWindow, PrintCardsPreview } from "./PrintCards";

function previewRowsToExport(rows: StudentPreviewRow[]) {
  return rows.map((r) => ({
    name: r.fullName.trim() || r.studentLoginId,
    class: r.classLabel ?? r.className,
    section: r.sectionName,
    username: r.studentLoginId,
    password: r.password,
  }));
}

type Props = {
  rows: StudentPreviewRow[];
  onRowsChange: (rows: StudentPreviewRow[]) => void;
  busy: boolean;
  onSave: (rows: StudentPreviewRow[]) => void;
  csvFilename: string;
  printTitle: string;
};

export function EditablePreviewStaging({
  rows,
  onRowsChange,
  busy,
  onSave,
  csvFilename,
  printTitle,
}: Props) {
  if (!rows.length) return null;

  function updateName(index: number, fullName: string) {
    const next = rows.map((r, i) => (i === index ? { ...r, fullName } : r));
    onRowsChange(next);
  }

  function printAll() {
    openPrintWindow(
      rows.map((r) => ({
        name: r.fullName.trim() || r.studentLoginId,
        class: r.classLabel ?? r.className,
        section: r.sectionName,
        username: r.studentLoginId,
        password: r.password,
      })),
      printTitle
    );
  }

  const emptyNames = rows.some((r) => !r.fullName.trim());

  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-sm font-semibold text-slate-800">Preview (not saved yet)</h3>
      <p className="text-sm text-slate-600">
        Edit the <strong>Name</strong> column so login cards and the student home screen show the correct name. Usernames
        and passwords stay the same.
      </p>
      {emptyNames && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Some names are empty. Fill every name before saving, or printing may show a placeholder.
        </p>
      )}
      <PrintCardsPreview
        rows={rows.map((r) => ({
          name: r.fullName.trim() || r.studentLoginId,
          class: r.classLabel ?? r.className,
          section: r.sectionName,
          username: r.studentLoginId,
          password: r.password,
        }))}
      />
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2 min-w-[180px]">Name</th>
              <th className="text-left p-2">Username</th>
              <th className="text-left p-2">Password</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, index) => (
              <tr key={r.studentLoginId}>
                <td className="p-2 align-middle">
                  <input
                    type="text"
                    value={r.fullName}
                    onChange={(e) => updateName(index, e.target.value)}
                    className="w-full min-w-[160px] rounded-md border border-slate-200 px-2 py-2 text-sm min-h-[40px]"
                    placeholder="Student name"
                    aria-label={`Name for ${r.studentLoginId}`}
                  />
                </td>
                <td className="p-2 font-mono text-xs align-middle">{r.studentLoginId}</td>
                <td className="p-2 font-mono align-middle">{r.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        <strong>Print</strong> opens a new tab (allow pop-ups). For a file you can open in Excel, use{" "}
        <strong>Download Excel</strong> or <strong>Download CSV</strong>.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(rows)}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 min-h-[44px]"
        >
          Save to database
        </button>
        <CSVDownloadButton rows={rows} filename={csvFilename} disabled={busy} label="Download CSV" />
        <button
          type="button"
          disabled={busy || !rows.length}
          onClick={() => downloadCredentialsXlsx(previewRowsToExport(rows), csvFilename.replace(/\.csv$/i, ""))}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:opacity-50 min-h-[44px]"
        >
          Download Excel
        </button>
        <button
          type="button"
          onClick={printAll}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium min-h-[44px] hover:bg-slate-50"
        >
          Print all
        </button>
      </div>
    </div>
  );
}
