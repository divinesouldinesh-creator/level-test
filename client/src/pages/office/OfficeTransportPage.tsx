import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { todayIso } from "../../attendanceReport";
import { formatInr, parseRupees } from "../../fees";

type UnitKind = "BUS" | "GENERATOR" | "MAGIC";

function unitLabel(kind: UnitKind): string {
  if (kind === "GENERATOR") return "Generator";
  if (kind === "MAGIC") return "Magic";
  return "Bus";
}

function unitKindFrom(value: string): UnitKind {
  if (value === "GENERATOR" || value === "MAGIC") return value;
  return "BUS";
}

type BusRow = {
  id: string;
  name: string;
  vehicleNo: string;
  kind: UnitKind;
  litres: number;
  amountRupees: number;
  kilometres: number;
  kmPerLitre: number | null;
};
type FillRow = {
  id: string;
  busId: string;
  busName: string;
  vehicleNo: string;
  filledOn: string;
  litres: number;
  amountRupees: number;
  odometerKm: number | null;
  previousKm: number | null;
  kilometres: number | null;
  kmPerLitre: number | null;
};
type TransportSummary = {
  from: string;
  to: string;
  totalLitres: number;
  totalAmount: number;
  totalKilometres: number;
  kmPerLitre: number | null;
  buses: BusRow[];
  fills: FillRow[];
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

function formatLitres(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function parseLitres(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseKm(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "").replace(/km$/i, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function OfficeTransportPage() {
  const initial = monthBounds(todayIso());
  const [month, setMonth] = useState(initial.month);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [summary, setSummary] = useState<TransportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busName, setBusName] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [unitKind, setUnitKind] = useState<UnitKind>("BUS");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [fillBusId, setFillBusId] = useState("");
  const [filledOn, setFilledOn] = useState(todayIso());
  const [litres, setLitres] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [odometerKm, setOdometerKm] = useState("");

  const load = useCallback(async (start: string, end: string) => {
    setError(null);
    const r = await api<TransportSummary>(
      `/api/v1/admin/transport?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`
    );
    if (!r.ok || !r.data) {
      setError(r.error ?? "Could not load transport");
      return;
    }
    setSummary(r.data);
    setFillBusId((current) => current || r.data!.buses[0]?.id || "");
  }, []);

  useEffect(() => {
    void load(from, to);
  }, [from, to, load]);

  async function saveBus() {
    setBusy(true);
    const r = await api<BusRow>("/api/v1/admin/transport/buses", {
      method: "POST",
      json: { name: busName, vehicleNo, kind: unitKind },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save this bus");
      return;
    }
    setBusName("");
    setVehicleNo("");
    setUnitKind("BUS");
    setError(null);
    await load(from, to);
  }

  async function saveName(bus: BusRow) {
    const name = editName.trim();
    if (!name) {
      setError("Enter the name");
      return;
    }
    setBusy(true);
    const r = await api(`/api/v1/admin/transport/buses/${bus.id}`, { method: "PATCH", json: { name } });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save this name");
      return;
    }
    setEditingId(null);
    setEditName("");
    setError(null);
    await load(from, to);
  }

  async function removeBus(bus: BusRow) {
    if (!window.confirm(`Remove ${bus.name} (${bus.vehicleNo}) and its diesel entries?`)) return;
    setBusy(true);
    const r = await api(`/api/v1/admin/transport/buses/${bus.id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not remove this bus");
      return;
    }
    if (fillBusId === bus.id) setFillBusId("");
    await load(from, to);
  }

  async function saveFill() {
    const selected = summary?.buses.find((bus) => bus.id === fillBusId);
    const generator = selected?.kind === "GENERATOR";
    const litreValue = parseLitres(litres);
    const rupees = parseRupees(amountRupees);
    const km = parseKm(odometerKm);
    if (!fillBusId || litreValue == null || rupees == null || rupees <= 0 || (!generator && km == null)) {
      setError(generator ? "Enter the date, litres, and amount" : "Enter the date, litres, amount, and current km");
      return;
    }
    setBusy(true);
    const r = await api("/api/v1/admin/transport/fills", {
      method: "POST",
      json: { busId: fillBusId, filledOn, litres: litreValue, amountRupees: rupees, odometerKm: generator ? null : km },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save this diesel entry");
      return;
    }
    setLitres("");
    setAmountRupees("");
    setOdometerKm("");
    setError(null);
    await load(from, to);
  }

  async function removeFill(fill: FillRow) {
    if (!window.confirm(`Delete ${formatLitres(fill.litres)} litres on ${fill.filledOn} for ${fill.busName}?`)) return;
    setBusy(true);
    const r = await api(`/api/v1/admin/transport/fills/${fill.id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not delete this entry");
      return;
    }
    await load(from, to);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Transport</h1>
      <p className="text-slate-600 mt-1">
        Diesel for each bus, Magic, or generator. A generator does not need kilometres. This is separate from the student transport fee.
      </p>
      {error ? <p className="text-sm text-red-600 mt-3">{error}</p> : null}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Add a bus, Magic, or generator</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Type</span>
            <select
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              value={unitKind}
              onChange={(event) => setUnitKind(unitKindFrom(event.target.value))}
            >
              <option value="BUS">Bus</option>
              <option value="MAGIC">Magic</option>
              <option value="GENERATOR">Generator</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Name</span>
            <input
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              value={busName}
              onChange={(event) => setBusName(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Number</span>
            <input
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              value={vehicleNo}
              onChange={(event) => setVehicleNo(event.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
              disabled={busy || busName.trim().length === 0 || vehicleNo.trim().length === 0}
              onClick={() => void saveBus()}
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Diesel entry</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-6">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Bus, Magic, or generator</span>
            <select
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              value={fillBusId}
              onChange={(event) => setFillBusId(event.target.value)}
            >
              {(summary?.buses.length ?? 0) === 0 ? <option value="">No bus yet</option> : null}
              {summary?.buses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  {unitLabel(bus.kind)} · {bus.name} · {bus.vehicleNo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Date</span>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              value={filledOn}
              onChange={(event) => setFilledOn(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Litres</span>
            <input
              inputMode="decimal"
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              value={litres}
              onChange={(event) => setLitres(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Amount</span>
            <input
              inputMode="numeric"
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              value={amountRupees}
              onChange={(event) => setAmountRupees(event.target.value)}
            />
          </label>
          {summary?.buses.find((bus) => bus.id === fillBusId)?.kind === "GENERATOR" ? null : (
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Current km</span>
              <input
                inputMode="numeric"
                className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                value={odometerKm}
                onChange={(event) => setOdometerKm(event.target.value)}
              />
            </label>
          )}
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
              disabled={busy || !fillBusId}
              onClick={() => void saveFill()}
            >
              Save entry
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Consumption</h2>
        <p className="text-sm text-slate-600 mt-1">
          Average is the kilometres since the last reading, divided by the litres filled this time.
        </p>
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

        {summary ? (
          <>
            <p className="mt-4 text-sm text-slate-700">
              All · {formatLitres(summary.totalLitres)} litres · {formatInr(summary.totalAmount)} · {summary.totalKilometres.toLocaleString("en-IN")} km
              {summary.kmPerLitre == null ? "" : ` · ${formatLitres(summary.kmPerLitre)} km per litre`}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Number</th>
                    <th className="p-2">Type</th>
                    <th className="p-2 text-right">Litres</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-right">Km</th>
                    <th className="p-2 text-right">Km per litre</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {summary.buses.length === 0 ? (
                    <tr>
                      <td className="p-3 text-slate-500" colSpan={8}>
                        No bus, Magic, or generator yet.
                      </td>
                    </tr>
                  ) : (
                    summary.buses.map((bus) => (
                      <tr key={bus.id} className="border-t border-slate-100">
                        <td className="p-2 font-medium text-slate-900">
                          {editingId === bus.id ? (
                            <input
                              className="w-full rounded-lg border px-2 py-1 min-h-[44px]"
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                            />
                          ) : (
                            bus.name
                          )}
                        </td>
                        <td className="p-2">{bus.vehicleNo}</td>
                        <td className="p-2">{unitLabel(bus.kind)}</td>
                        <td className="p-2 text-right">{formatLitres(bus.litres)}</td>
                        <td className="p-2 text-right">{formatInr(bus.amountRupees)}</td>
                        <td className="p-2 text-right">{bus.kilometres.toLocaleString("en-IN")}</td>
                        <td className="p-2 text-right">{bus.kmPerLitre == null ? "—" : formatLitres(bus.kmPerLitre)}</td>
                        <td className="p-2 text-right whitespace-nowrap">
                          {editingId === bus.id ? (
                            <>
                              <button
                                type="button"
                                className="text-sm font-medium text-brand-700 mr-3"
                                disabled={busy}
                                onClick={() => void saveName(bus)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="text-sm text-slate-600"
                                disabled={busy}
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="text-sm text-brand-700 mr-3"
                              disabled={busy}
                              onClick={() => {
                                setEditingId(bus.id);
                                setEditName(bus.name);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-sm text-rose-700"
                            disabled={busy}
                            onClick={() => void removeBus(bus)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h3 className="mt-6 font-medium text-slate-900">Entries in this range</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">Vehicle</th>
                    <th className="p-2 text-right">Km</th>
                    <th className="p-2 text-right">Litres</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-right">Km per litre</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {summary.fills.length === 0 ? (
                    <tr>
                      <td className="p-3 text-slate-500" colSpan={7}>
                        No diesel entry in this range.
                      </td>
                    </tr>
                  ) : (
                    summary.fills.map((fill) => (
                      <tr key={fill.id} className="border-t border-slate-100">
                        <td className="p-2">{fill.filledOn}</td>
                        <td className="p-2">
                          {fill.busName} · {fill.vehicleNo}
                        </td>
                        <td className="p-2 text-right">
                          {fill.odometerKm == null ? "—" : fill.odometerKm.toLocaleString("en-IN")}
                        </td>
                        <td className="p-2 text-right">{formatLitres(fill.litres)}</td>
                        <td className="p-2 text-right">{formatInr(fill.amountRupees)}</td>
                        <td className="p-2 text-right">{fill.kmPerLitre == null ? "—" : formatLitres(fill.kmPerLitre)}</td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            className="text-sm text-rose-700"
                            disabled={busy}
                            onClick={() => void removeFill(fill)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Loading transport…</p>
        )}
      </section>
    </div>
  );
}
