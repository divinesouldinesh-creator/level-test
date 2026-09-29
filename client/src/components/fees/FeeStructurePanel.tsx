import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "../../api";
import {
  applyFeeStructureUpload,
  feeStructureTemplateCsv,
  formatInr,
  parseFeeStructureSheet,
  type FeeStructureRow,
} from "../../fees";

type Toast = { type: "ok" | "err"; message: string };

export function FeeStructurePanel() {
  const [academicYear, setAcademicYear] = useState("");
  const [transportRatePerKm, setTransportRatePerKm] = useState(0);
  const [rows, setRows] = useState<FeeStructureRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const load = useCallback(async (year?: string) => {
    const qs = year ? `?academicYear=${encodeURIComponent(year)}` : "";
    const [structure, meta] = await Promise.all([
      api<{ academicYear: string; transportRatePerKm: number; structures: FeeStructureRow[] }>(
        `/api/v1/admin/fees/structures${qs}`
      ),
      api<{ academicYear: string }>("/api/v1/admin/fees/meta"),
    ]);
    if (!structure.ok || !structure.data) {
      setErr(structure.error ?? "Could not load fee structure");
      if (meta.data?.academicYear) setAcademicYear(meta.data.academicYear);
      return;
    }
    setErr(null);
    setAcademicYear(structure.data.academicYear || meta.data?.academicYear || "");
    setTransportRatePerKm(structure.data.transportRatePerKm ?? 0);
    setRows(structure.data.structures);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setAmount(classId: string, field: keyof FeeStructureRow, value: string) {
    const n = Number(value.replace(/[^\d]/g, ""));
    setRows((prev) =>
      prev.map((row) => (row.classId === classId ? { ...row, [field]: Number.isFinite(n) ? n : 0 } : row))
    );
  }

  async function persist(nextRows: FeeStructureRow[], year: string, rate = transportRatePerKm) {
    if (!year) {
      showToast({ type: "err", message: "Academic year is missing. Refresh the page and try again." });
      return false;
    }
    if (!nextRows.length) {
      showToast({ type: "err", message: "No classes to save. Add classes under Students first." });
      return false;
    }
    const r = await api<{ academicYear: string; transportRatePerKm: number; structures: FeeStructureRow[] }>(
      "/api/v1/admin/fees/structures",
      {
        method: "PUT",
        json: {
          academicYear: year,
          transportRatePerKm: rate,
          structures: nextRows.map((row) => ({
            classId: row.classId,
            tuitionAmount: row.tuitionAmount,
            annualAmount: row.annualAmount,
            admissionAmount: row.admissionAmount,
            registrationAmount: row.registrationAmount,
            examAmount: row.examAmount,
          })),
        },
      }
    );
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Save failed" });
      return false;
    }
    if (r.data?.structures) setRows(r.data.structures);
    if (r.data?.academicYear) setAcademicYear(r.data.academicYear);
    if (r.data?.transportRatePerKm != null) setTransportRatePerKm(r.data.transportRatePerKm);
    return true;
  }

  async function save() {
    setBusy(true);
    const ok = await persist(rows, academicYear);
    setBusy(false);
    if (ok) showToast({ type: "ok", message: "Fee structure saved for this academic year." });
  }

  async function handleFile(file: File | null) {
    setErr(null);
    setFileName(null);
    if (!file) return;
    if (!rows.length) {
      showToast({ type: "err", message: "Load classes first, then upload. If this stays empty, refresh or add classes." });
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (!wb.SheetNames.length) throw new Error("Empty file");
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed = parseFeeStructureSheet(rawRows);
      const applied = applyFeeStructureUpload(rows, parsed);
      if (applied.matched === 0) {
        throw new Error(
          `No classes matched. File class names must match school classes (e.g. ${rows[0]?.classLabel || rows[0]?.className}). Unmatched: ${applied.unmatched.join(", ")}`
        );
      }
      setRows(applied.rows);
      setFileName(file.name);
      const ok = await persist(applied.rows, academicYear);
      if (ok) {
        const extra = applied.unmatched.length ? ` Unmatched: ${applied.unmatched.join(", ")}.` : "";
        showToast({
          type: "ok",
          message: `Uploaded ${file.name}: updated ${applied.matched} class${applied.matched === 1 ? "" : "es"} and saved.${extra}`,
        });
      }
    } catch (e) {
      showToast({ type: "err", message: e instanceof Error ? e.message : "Could not read that file" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const csv = feeStructureTemplateCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fee-structure-${academicYear || "template"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <p className={`text-sm ${toast.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>{toast.message}</p>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="font-semibold text-slate-900">Upload fee structure</h2>
        <p className="text-sm text-slate-600">
          Excel or CSV with columns <strong>Class, Tuition, Annual, Activity, Registration, Exam</strong>. Class should
          match the school class name or grade (for example 1, 2, 5A). Upload saves immediately.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Working…" : "Upload Excel / CSV"}
          </button>
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm font-medium min-h-[44px]"
            onClick={downloadTemplate}
          >
            Download template
          </button>
        </div>
        {fileName ? <p className="text-sm text-slate-500">Last file: {fileName}</p> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Class fees · {academicYear || "…"}</h2>
        <p className="text-sm text-slate-600 mt-1">
          Tuition and the other class amounts are per class. Transport is rupees per kilometre for the whole school.
          Each child’s kilometres are entered on their fee account.
        </p>
        <label className="mt-3 block text-sm max-w-xs">
          <span className="block text-slate-600 mb-1">Transport rate (₹ per km / month)</span>
          <input
            className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
            inputMode="numeric"
            value={transportRatePerKm}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^\d]/g, ""));
              setTransportRatePerKm(Number.isFinite(n) ? n : 0);
            }}
          />
        </label>
        {rows.length === 0 && !err ? (
          <p className="mt-4 text-sm text-slate-500">No classes loaded yet.</p>
        ) : null}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="p-2">Class</th>
                <th className="p-2">Tuition / month</th>
                <th className="p-2">Annual</th>
                <th className="p-2">Activity</th>
                <th className="p-2">Registration</th>
                <th className="p-2">Exam</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.classId} className="border-t border-slate-100">
                  <td className="p-2 font-medium text-slate-900">
                    {row.className}
                    <span className="block text-xs text-slate-500">{row.classLabel}</span>
                  </td>
                  {(
                    [
                      ["tuitionAmount", row.tuitionAmount],
                      ["annualAmount", row.annualAmount],
                      ["admissionAmount", row.admissionAmount],
                      ["registrationAmount", row.registrationAmount],
                      ["examAmount", row.examAmount],
                    ] as const
                  ).map(([field, value]) => (
                    <td key={field} className="p-2">
                      <input
                        className="w-28 rounded-lg border px-2 py-2 min-h-[44px]"
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setAmount(row.classId, field, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="mt-4 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
          disabled={busy || rows.length === 0}
          onClick={() => void save()}
        >
          Save structure
        </button>
        {rows[0] ? (
          <p className="mt-3 text-sm text-slate-500">
            Example: {formatInr(rows[0].tuitionAmount)} tuition for {rows[0].classLabel}.
          </p>
        ) : null}
      </section>
    </div>
  );
}
