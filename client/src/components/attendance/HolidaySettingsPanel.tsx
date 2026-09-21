import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { formatMonthLabel, todayIso, yearMonthFromIso, defaultHolidaysInRange } from "../../attendanceReport";
import { monthBounds } from "./AttendanceMonthCalendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type SaturdayRule = "NONE" | "SECOND" | "ALL";
type HolidayKind = "EXTRA" | "WORKING";
type HolidaySource = "sunday" | "second_saturday" | "saturday" | "extra";

type HolidaySettings = {
  sundaysOff: boolean;
  saturdayRule: SaturdayRule;
};

type HolidayException = {
  id: string;
  date: string;
  kind: HolidayKind;
  name: string | null;
};

type ResolvedHoliday = {
  date: string;
  name: string;
  source: HolidaySource;
};

type HolidaySettingsPayload = {
  from?: string;
  to?: string;
  settings: HolidaySettings;
  holidays: ResolvedHoliday[];
  exceptions: HolidayException[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function utcDayOfWeekMon0(iso: string): number {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return (d.getUTCDay() + 6) % 7;
}

function daysInYearMonth(yearMonth: string): string[] {
  const { to } = monthBounds(yearMonth);
  const [y, m] = yearMonth.split("-").map(Number);
  const last = Number(to.slice(8, 10));
  const days: string[] = [];
  for (let day = 1; day <= last; day++) {
    days.push(`${y}-${pad2(m)}-${pad2(day)}`);
  }
  return days;
}

export function HolidaySettingsPanel() {
  const today = todayIso();
  const [visibleMonth, setVisibleMonth] = useState(() => yearMonthFromIso(today));
  const [settings, setSettings] = useState<HolidaySettings>({
    sundaysOff: true,
    saturdayRule: "SECOND",
  });
  const [holidays, setHolidays] = useState<ResolvedHoliday[]>([]);
  const [exceptions, setExceptions] = useState<HolidayException[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [extraDate, setExtraDate] = useState(today);
  const [extraName, setExtraName] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);

  const { from, to } = useMemo(() => monthBounds(visibleMonth), [visibleMonth]);
  const days = useMemo(() => daysInYearMonth(visibleMonth), [visibleMonth]);
  const leadEmpty = days[0] ? utcDayOfWeekMon0(days[0]) : 0;

  const holidayByDate = useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays]);
  const exceptionByDate = useMemo(() => new Map(exceptions.map((e) => [e.date, e])), [exceptions]);
  const displayHolidayByDate = useMemo(() => {
    if (!loading || holidayByDate.size > 0) return holidayByDate;
    const preview = new Map<string, ResolvedHoliday>();
    for (const [date, name] of defaultHolidaysInRange(from, to, settings)) {
      preview.set(date, {
        date,
        name,
        source: name === "Sunday" ? "sunday" : name === "Saturday" ? "saturday" : "second_saturday",
      });
    }
    return preview;
  }, [holidayByDate, loading, from, to, settings]);

  async function reload() {
    setErr(null);
    const r = await api<HolidaySettingsPayload>(
      `/api/v1/admin/attendance/holiday-settings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    setLoading(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not load holidays");
      return;
    }
    setSettings(r.data.settings);
    setHolidays(r.data.holidays ?? []);
    setExceptions(r.data.exceptions ?? []);
  }

  useEffect(() => {
    setHolidays([]);
    setExceptions([]);
    setLoading(true);
    void reload();
  }, [from, to]);

  async function saveSettings(next: HolidaySettings) {
    setSaving(true);
    setErr(null);
    setMessage(null);
    const r = await api<{ settings: HolidaySettings }>("/api/v1/admin/attendance/holiday-settings", {
      method: "PATCH",
      json: next,
    });
    setSaving(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not save holiday settings");
      return;
    }
    setSettings(r.data.settings);
    setMessage("Holiday rules saved.");
    await reload();
  }

  async function addExtra(e: React.FormEvent) {
    e.preventDefault();
    if (!extraDate || !extraName.trim()) return;
    setSaving(true);
    setErr(null);
    setMessage(null);
    const r = await api("/api/v1/admin/attendance/holidays", {
      method: "POST",
      json: { date: extraDate, kind: "EXTRA", name: extraName.trim() },
    });
    setSaving(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not add holiday");
      return;
    }
    setExtraName("");
    setMessage(`Added holiday on ${extraDate}.`);
    setVisibleMonth(yearMonthFromIso(extraDate));
    setSelectedDate(extraDate);
    await reload();
  }

  async function markWorking(iso: string) {
    setSaving(true);
    setErr(null);
    setMessage(null);
    const r = await api("/api/v1/admin/attendance/holidays", {
      method: "POST",
      json: { date: iso, kind: "WORKING" },
    });
    setSaving(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not mark as working day");
      return;
    }
    setMessage(`${iso} is now a working day.`);
    await reload();
  }

  async function removeException(id: string, label: string) {
    setSaving(true);
    setErr(null);
    setMessage(null);
    const r = await api(`/api/v1/admin/attendance/holidays/${id}`, { method: "DELETE" });
    setSaving(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not update holiday");
      return;
    }
    setMessage(label);
    await reload();
  }

  async function onSelectDay(iso: string) {
    setSelectedDate(iso);
    const holiday = displayHolidayByDate.get(iso);
    const exception = exceptionByDate.get(iso);
    if (exception?.kind === "WORKING") {
      if (!window.confirm(`Restore ${iso} as a holiday?`)) return;
      await removeException(exception.id, `${iso} is a holiday again.`);
      return;
    }
    if (exception?.kind === "EXTRA") {
      if (!window.confirm(`Remove holiday “${exception.name ?? iso}”?`)) return;
      await removeException(exception.id, `Removed holiday on ${iso}.`);
      return;
    }
    if (holiday) {
      if (!window.confirm(`Mark ${iso} (${holiday.name}) as a working day?`)) return;
      await markWorking(iso);
    }
  }

  const selectedHoliday = displayHolidayByDate.get(selectedDate);
  const selectedException = exceptionByDate.get(selectedDate);
  const extraThisMonth = exceptions.filter((e) => e.kind === "EXTRA");
  const workingThisMonth = exceptions.filter((e) => e.kind === "WORKING");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={settings.sundaysOff}
            disabled={saving}
            onChange={(e) => void saveSettings({ ...settings, sundaysOff: e.target.checked })}
          />
          <span>Sundays are holidays</span>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Saturdays</span>
          <select
            className="w-full rounded-lg border px-3 py-2"
            value={settings.saturdayRule}
            disabled={saving}
            onChange={(e) => void saveSettings({ ...settings, saturdayRule: e.target.value as SaturdayRule })}
          >
            <option value="SECOND">Only 2nd Saturday is a holiday</option>
            <option value="ALL">All Saturdays are holidays</option>
            <option value="NONE">No Saturday holiday (all working)</option>
          </select>
        </label>
      </div>

      <form onSubmit={addExtra} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
        <p className="text-sm font-medium text-slate-900">Add an extra holiday</p>
        <p className="mt-1 text-xs text-slate-600">Diwali, local breaks, or any other closed day.</p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            type="date"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={extraDate}
            onChange={(e) => setExtraDate(e.target.value)}
            disabled={saving}
          />
          <input
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="Holiday name"
            value={extraName}
            onChange={(e) => setExtraName(e.target.value)}
            disabled={saving}
          />
          <button
            type="submit"
            disabled={saving || !extraDate || !extraName.trim()}
            className="rounded-lg border border-indigo-600 bg-white text-indigo-700 px-4 py-2 text-sm font-medium disabled:opacity-50 min-h-[40px]"
          >
            {saving ? "Saving…" : "Add holiday"}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 min-h-[36px]"
            onClick={() => setVisibleMonth((m) => shiftYearMonth(m, -1))}
            aria-label="Previous month"
          >
            ‹
          </button>
          <p className="flex-1 text-center text-sm font-semibold text-slate-900">{formatMonthLabel(visibleMonth)}</p>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100 min-h-[36px]"
            onClick={() => setVisibleMonth((m) => shiftYearMonth(m, 1))}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: leadEmpty }, (_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((iso) => {
            const holiday = displayHolidayByDate.get(iso);
            const working = exceptionByDate.get(iso)?.kind === "WORKING";
            const selected = iso === selectedDate;
            let tone = "text-slate-700 hover:bg-white";
            if (holiday) tone = "bg-violet-100 text-violet-900 hover:bg-violet-200";
            else if (working) tone = "bg-sky-100 text-sky-900 hover:bg-sky-200";

            return (
              <button
                key={iso}
                type="button"
                disabled={saving}
                onClick={() => void onSelectDay(iso)}
                className={`h-9 w-full rounded-lg text-sm ${tone} ${
                  selected ? "ring-2 ring-indigo-600 ring-offset-1" : ""
                }`}
                title={
                  holiday
                    ? `${iso} · ${holiday.name}`
                    : working
                      ? `${iso} · working day (override)`
                      : iso
                }
              >
                {Number(iso.slice(8, 10))}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1 mr-3">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-300" /> Holiday
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-300" /> Working day override
          </span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Tap a holiday to make it a working day. Tap an extra holiday to remove it. Tap a blue day to restore the
          holiday.
        </p>
        {selectedDate ? (
          <p className="mt-1 text-sm">
            Selected <span className="font-medium text-slate-900">{selectedDate}</span>
            {selectedHoliday ? (
              <span className="text-violet-800"> · {selectedHoliday.name}</span>
            ) : selectedException?.kind === "WORKING" ? (
              <span className="text-sky-800"> · working day override</span>
            ) : (
              <span className="text-slate-500"> · school day</span>
            )}
          </p>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-slate-500">Updating…</p> : null}
      {err ? <p className="text-sm text-rose-700">{err}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      {(extraThisMonth.length > 0 || workingThisMonth.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          {extraThisMonth.length > 0 ? (
            <div>
              <p className="font-medium text-slate-900 mb-1">Extra holidays this month</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {extraThisMonth.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {e.date} · {e.name || "Holiday"}
                    </span>
                    <button
                      type="button"
                      className="text-rose-700 text-xs font-medium"
                      disabled={saving}
                      onClick={() => void removeException(e.id, `Removed holiday on ${e.date}.`)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {workingThisMonth.length > 0 ? (
            <div>
              <p className="font-medium text-slate-900 mb-1">Working-day overrides</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {workingThisMonth.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>{e.date}</span>
                    <button
                      type="button"
                      className="text-indigo-700 text-xs font-medium"
                      disabled={saving}
                      onClick={() => void removeException(e.id, `${e.date} is a holiday again.`)}
                    >
                      Restore holiday
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
