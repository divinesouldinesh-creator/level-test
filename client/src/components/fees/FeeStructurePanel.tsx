import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { formatInr, type FeeStructureRow } from "../../fees";

type Toast = { type: "ok" | "err"; message: string };

export function FeeStructurePanel() {
  const [academicYear, setAcademicYear] = useState("");
  const [rows, setRows] = useState<FeeStructureRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async (year?: string) => {
    const qs = year ? `?academicYear=${encodeURIComponent(year)}` : "";
    const r = await api<{ academicYear: string; structures: FeeStructureRow[] }>(`/api/v1/admin/fees/structures${qs}`);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not load fee structure");
      return;
    }
    setErr(null);
    setAcademicYear(r.data.academicYear);
    setRows(r.data.structures);
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

  async function save() {
    setBusy(true);
    const r = await api("/api/v1/admin/fees/structures", {
      method: "PUT",
      json: {
        academicYear,
        structures: rows.map((row) => ({
          classId: row.classId,
          tuitionAmount: row.tuitionAmount,
          transportAmount: row.transportAmount,
          annualAmount: row.annualAmount,
          admissionAmount: row.admissionAmount,
          examAmount: row.examAmount,
        })),
      },
    });
    setBusy(false);
    if (!r.ok) {
      showToast({ type: "err", message: r.error ?? "Save failed" });
      return;
    }
    showToast({ type: "ok", message: "Fee structure saved for this academic year." });
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <p className={`text-sm ${toast.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>{toast.message}</p>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Class fees · {academicYear || "…"}</h2>
        <p className="text-sm text-slate-600 mt-1">
          Tuition is monthly. Sibling families add the children’s class fees (e.g. 3000 + 1000 = 4000) and show 4000 on
          both accounts.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="p-2">Class</th>
                <th className="p-2">Tuition / month</th>
                <th className="p-2">Transport / month</th>
                <th className="p-2">Annual</th>
                <th className="p-2">Admission</th>
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
                      ["transportAmount", row.transportAmount],
                      ["annualAmount", row.annualAmount],
                      ["admissionAmount", row.admissionAmount],
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
          className="mt-4 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
          disabled={busy || rows.length === 0}
          onClick={() => void save()}
        >
          Save structure
        </button>
        {rows[0] ? (
          <p className="mt-3 text-sm text-slate-500">
            Example display: {formatInr(rows[0].tuitionAmount)} tuition for {rows[0].classLabel}.
          </p>
        ) : null}
      </section>
    </div>
  );
}
