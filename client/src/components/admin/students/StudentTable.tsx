import { downloadCredentialsCsv, downloadCredentialsXlsx } from "./credentialExport";
import type { StudentListRow } from "./types";
import { openPrintWindow } from "./PrintCards";

export function StudentTable({
  rows,
  passwordHints,
  filterClassId,
  filterSectionId,
  onFilterClass,
  onFilterSection,
  classOptions,
  sectionOptions,
  busyId,
  onResetPassword,
  onDelete,
  onPrintClass,
}: {
  rows: StudentListRow[];
  passwordHints: Record<string, string>;
  filterClassId: string;
  filterSectionId: string;
  onFilterClass: (id: string) => void;
  onFilterSection: (id: string) => void;
  classOptions: { id: string; label: string }[];
  sectionOptions: { id: string; label: string }[];
  busyId: string | null;
  onResetPassword: (id: string) => void;
  onDelete: (id: string) => void;
  onPrintClass: () => void;
}) {
  function rowToCard(row: StudentListRow) {
    return {
      name: row.fullName,
      class: row.classLabel,
      section: row.sectionName,
      username: row.username,
      password: passwordHints[row.id],
    };
  }

  function rowToExport(row: StudentListRow) {
    return {
      name: row.fullName,
      class: row.classLabel,
      section: row.sectionName,
      username: row.username,
      password: passwordHints[row.id] ?? "",
    };
  }

  function printOne(row: StudentListRow) {
    openPrintWindow([rowToCard(row)], `Login — ${row.fullName}`);
  }

  function exportList(base: string) {
    const data = rows.map(rowToExport);
    downloadCredentialsCsv(data, `${base}-${Date.now()}`);
  }

  function exportListXlsx(base: string) {
    const data = rows.map(rowToExport);
    downloadCredentialsXlsx(data, `${base}-${Date.now()}`);
  }

  function exportOneCsv(row: StudentListRow) {
    downloadCredentialsCsv([rowToExport(row)], `login-${row.username}`);
  }

  function exportOneXlsx(row: StudentListRow) {
    downloadCredentialsXlsx([rowToExport(row)], `login-${row.username}`);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-900">All students</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm">
            <span className="block font-medium text-slate-700 mb-1">Class</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-base min-h-[44px] min-w-[140px]"
              value={filterClassId}
              onChange={(e) => onFilterClass(e.target.value)}
            >
              <option value="">All classes</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block font-medium text-slate-700 mb-1">Section</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-base min-h-[44px] min-w-[120px]"
              value={filterSectionId}
              onChange={(e) => onFilterSection(e.target.value)}
            >
              <option value="">All sections</option>
              {sectionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onPrintClass}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium min-h-[44px] hover:bg-slate-50"
          >
            Print class
          </button>
          <button
            type="button"
            disabled={!rows.length}
            onClick={() => exportList("class-logins")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium min-h-[44px] hover:bg-slate-50 disabled:opacity-50"
          >
            Download CSV
          </button>
          <button
            type="button"
            disabled={!rows.length}
            onClick={() => exportListXlsx("class-logins")}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-900 min-h-[44px] hover:bg-emerald-100 disabled:opacity-50"
          >
            Download Excel
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Passwords are not stored in plain text—CSV/Excel password column is empty until you use &quot;Reset
        password&quot; (then export or print). Allow pop-ups for Print. Use Download Excel/CSV for a spreadsheet.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Class</th>
              <th className="p-3 font-medium">Section</th>
              <th className="p-3 font-medium">Username</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  No students match the filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="p-3 font-medium text-slate-900">{row.fullName}</td>
                  <td className="p-3">{row.classLabel}</td>
                  <td className="p-3">{row.sectionName}</td>
                  <td className="p-3 font-mono text-xs">{row.username}</td>
                  <td className="p-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium hover:bg-slate-50"
                        onClick={() => printOne(row)}
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium hover:bg-slate-50"
                        onClick={() => exportOneCsv(row)}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                        onClick={() => exportOneXlsx(row)}
                      >
                        Excel
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        onClick={() => onResetPassword(row.id)}
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                        onClick={() => onDelete(row.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
