import type { AttendanceRange } from "../attendanceReport";

type Props = {
  range: AttendanceRange;
  onRangeChange: (range: AttendanceRange) => void;
  date: string;
  onDateChange: (date: string) => void;
  customFrom: string;
  onCustomFromChange: (date: string) => void;
  customTo: string;
  onCustomToChange: (date: string) => void;
  rangeHint?: string;
};

export function AttendanceRangeFilters({
  range,
  onRangeChange,
  date,
  onDateChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
  rangeHint,
}: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <select
        className="rounded-lg border px-3 py-2"
        value={range}
        onChange={(e) => onRangeChange(e.target.value as AttendanceRange)}
      >
        <option value="daily">Daily</option>
        <option value="last_7_days">Last 7 days</option>
        <option value="weekly">This week</option>
        <option value="last_month">Last month</option>
        <option value="monthly">This month</option>
        <option value="academic_year">Academic year (from 1 April)</option>
        <option value="custom">Custom range</option>
      </select>

      {range === "custom" ? (
        <>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">From</span>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">To</span>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
            />
          </label>
        </>
      ) : (
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">
            {range === "academic_year" ? "As of date" : "Reference date"}
          </span>
          <input
            type="date"
            className="w-full rounded-lg border px-3 py-2"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </label>
      )}

      {rangeHint ? (
        <p className="text-sm text-slate-500 flex items-center md:col-span-2 lg:col-span-1">{rangeHint}</p>
      ) : null}
    </div>
  );
}
