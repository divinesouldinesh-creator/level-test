import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { formatInr, istToday, type FeePaymentMode } from "../../fees";

type CollectionRow = {
  id: string;
  amount: number;
  mode: FeePaymentMode;
  receiptNo: string;
  paidOn: string;
  family: string;
};

type Collections = {
  from: string;
  to: string;
  total: number;
  count: number;
  payments: CollectionRow[];
};

function monthBounds(day: string): { from: string; to: string; month: string } {
  const [year, month] = day.split("-");
  const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(last).padStart(2, "0")}`,
    month: `${year}-${month}`,
  };
}

const modeLabel: Record<FeePaymentMode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK: "Bank",
};

export function FeeCollectionsPanel() {
  const initial = monthBounds(istToday());
  const [month, setMonth] = useState(initial.month);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<Collections | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (start: string, end: string) => {
    setError(null);
    const r = await api<Collections>(
      `/api/v1/admin/fees/collections?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`
    );
    if (!r.ok || !r.data) {
      setError(r.error ?? "Could not load payments");
      return;
    }
    setData(r.data);
  }, []);

  useEffect(() => {
    void load(from, to);
  }, [from, to, load]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Payments</h2>
      <p className="text-sm text-slate-600 mt-1">Fees collected between the two dates.</p>
      {error ? <p className="text-sm text-red-600 mt-3">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Month</span>
          <input
            type="month"
            className="rounded-lg border px-3 py-2 min-h-[44px]"
            value={month}
            onChange={(event) => {
              const value = event.target.value;
              setMonth(value);
              if (!value) return;
              const bounds = monthBounds(`${value}-01`);
              setFrom(bounds.from);
              setTo(bounds.to);
            }}
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">From</span>
          <input
            type="date"
            className="rounded-lg border px-3 py-2 min-h-[44px]"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">To</span>
          <input
            type="date"
            className="rounded-lg border px-3 py-2 min-h-[44px]"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>

      {data ? (
        <>
          <p className="mt-4 text-sm text-slate-800">
            {formatInr(data.total)} · {data.count} {data.count === 1 ? "receipt" : "receipts"}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Receipt</th>
                  <th className="p-2">Family</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.length === 0 ? (
                  <tr>
                    <td className="p-3 text-slate-500" colSpan={5}>
                      No payment in this range.
                    </td>
                  </tr>
                ) : (
                  data.payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-slate-100">
                      <td className="p-2">{payment.paidOn}</td>
                      <td className="p-2">{payment.receiptNo}</td>
                      <td className="p-2">{payment.family || "—"}</td>
                      <td className="p-2">{modeLabel[payment.mode]}</td>
                      <td className="p-2 text-right">{formatInr(payment.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Loading payments…</p>
      )}
    </section>
  );
}
