import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { formatMonthLabel, todayIso, yearMonthFromIso, yesterdayIso, defaultHolidaysInRange } from "../../attendanceReport";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function monthBounds(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return { from: `${yearMonth}-01`, to: `${yearMonth}-28` };
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${pad2(last)}` };
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

type Props = {
  classId: string;
  sectionId: string;
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  refreshKey?: number;
  disabled?: boolean;
};

export function AttendanceMonthCalendar({
  classId,
  sectionId,
  selectedDate,
  onSelectDate,
  refreshKey = 0,
  disabled,
}: Props) {
  const today = todayIso();
  const [visibleMonth, setVisibleMonth] = useState(() => yearMonthFromIso(selectedDate || today));
  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set());
  const [apiHolidays, setApiHolidays] = useState<Map<string, string> | null>(null);
  const [loading, setLoading] = useState(false);

  const days = useMemo(() => daysInYearMonth(visibleMonth), [visibleMonth]);
  const leadEmpty = days[0] ? utcDayOfWeekMon0(days[0]) : 0;
  const { from, to } = useMemo(() => monthBounds(visibleMonth), [visibleMonth]);
  const holidays = useMemo(
    () => apiHolidays ?? defaultHolidaysInRange(from, to),
    [apiHolidays, from, to]
  );

  useEffect(() => {
    if (!classId || !sectionId) {
      setMarkedDates(new Set());
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const r = await api<{ dates: string[] }>(
        `/api/v1/teacher/attendance/marked-dates?classId=${encodeURIComponent(classId)}&sectionId=${encodeURIComponent(
          sectionId
        )}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (cancelled) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setMarkedDates(new Set());
        return;
      }
      setMarkedDates(new Set(r.data.dates ?? []));
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, sectionId, from, to, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setApiHolidays(null);
    void (async () => {
      const r = await api<{ holidays: { date: string; name: string }[] }>(
        `/api/v1/settings/holidays?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (cancelled) return;
      if (!r.ok || !r.data) return;
      setApiHolidays(new Map((r.data.holidays ?? []).map((h) => [h.date, h.name])));
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const unmarkedSchoolDays = useMemo(() => {
    return days.filter((iso) => iso <= today && !holidays.has(iso) && !markedDates.has(iso));
  }, [days, holidays, markedDates, today]);
  const dueSchoolDays = useMemo(() => {
    return days.filter((iso) => iso <= today && !holidays.has(iso));
  }, [days, holidays, today]);

  const selectedMarked = markedDates.has(selectedDate);
  const selectedHoliday = holidays.get(selectedDate);
  const selectedIsFuture = selectedDate > today;
  const selectedInView = yearMonthFromIso(selectedDate) === visibleMonth;

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50/60 p-3 ${disabled ? "opacity-60 pointer-events-none" : ""}`}
    >
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
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 min-h-[36px]"
          onClick={() => {
            const yesterday = yesterdayIso();
            setVisibleMonth(yearMonthFromIso(yesterday));
            onSelectDate(yesterday);
          }}
        >
          Yesterday
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 min-h-[36px]"
          onClick={() => {
            setVisibleMonth(yearMonthFromIso(today));
            onSelectDate(today);
          }}
        >
          Today
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
          const dayNum = Number(iso.slice(8, 10));
          const marked = markedDates.has(iso);
          const holidayName = holidays.get(iso);
          const future = iso > today;
          const selected = iso === selectedDate;
          const isToday = iso === today;
          const unmarkedDue = !marked && !holidayName && !future;

          let tone = "text-slate-700 hover:bg-white";
          if (marked) tone = "bg-emerald-100 text-emerald-800 font-medium hover:bg-emerald-200";
          else if (holidayName) tone = "bg-violet-100 text-violet-900 hover:bg-violet-200";
          else if (unmarkedDue) tone = "bg-amber-100 text-amber-900 hover:bg-amber-200";
          else if (future) tone = "text-slate-400 hover:bg-white";

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(iso)}
              aria-label={`${iso}${
                marked ? ", marked" : holidayName ? `, holiday ${holidayName}` : unmarkedDue ? ", not marked" : ""
              }`}
              aria-pressed={selected}
              className={`h-9 w-full rounded-lg text-sm ${tone} ${
                selected ? "ring-2 ring-indigo-600 ring-offset-1" : ""
              } ${isToday && !selected ? "font-semibold" : ""}`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 mr-3">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300" /> Marked
        </span>
        <span className="inline-flex items-center gap-1 mr-3">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-300" /> Not marked
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-300" /> Holiday
        </span>
      </p>
      {loading ? <p className="mt-2 text-xs text-slate-500">Updating marked days…</p> : null}
      {!classId || !sectionId ? (
        <p className="mt-1 text-sm text-slate-500">Select a class and section to see marked days.</p>
      ) : !loading ? (
        <p className="mt-1 text-sm text-slate-700">
          {dueSchoolDays.length === 0
            ? "No school days due yet in this month."
            : unmarkedSchoolDays.length === 0
              ? "All school days in this month are marked (up to today)."
              : `${unmarkedSchoolDays.length} school day${unmarkedSchoolDays.length === 1 ? "" : "s"} not marked yet this month.`}
        </p>
      ) : null}
      {selectedDate && selectedInView ? (
        <p className="mt-1 text-sm">
          Selected <span className="font-medium text-slate-900">{selectedDate}</span>
          {selectedHoliday ? (
            <span className="text-violet-800"> · holiday ({selectedHoliday})</span>
          ) : selectedIsFuture ? (
            <span className="text-slate-500"> · future day</span>
          ) : selectedMarked ? (
            <span className="text-emerald-700"> · already marked</span>
          ) : (
            <span className="text-amber-800"> · not marked yet</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
