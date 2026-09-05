/** School calendar day in Asia/Kolkata (IST). */
export function istDayKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Previous calendar day key (IST). */
export function previousIstDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  // Noon UTC avoids DST edge cases; IST offset applied via formatter.
  const utc = new Date(Date.UTC(y, m - 1, d, 6, 30));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return istDayKey(utc);
}

export function daysBetweenIst(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

/** True if `YYYY-MM-DD`. */
export function isIstDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Inclusive IST calendar day → UTC half-open range `[start, end)`.
 * Uses explicit +05:30 so queries match school-day boundaries.
 */
export function istDayUtcRange(dayKey: string): { start: Date; end: Date } | null {
  if (!isIstDayKey(dayKey)) return null;
  const start = new Date(`${dayKey}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

/** Shift an IST day key by `deltaDays` (negative = past). */
export function addIstDays(dayKey: string, deltaDays: number): string | null {
  if (!isIstDayKey(dayKey)) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 6, 30));
  utc.setUTCDate(utc.getUTCDate() + deltaDays);
  return istDayKey(utc);
}

/**
 * Inclusive IST day range from `fromKey` through `toKey` → UTC `[start, end)`.
 */
export function istInclusiveDayRangeUtc(
  fromKey: string,
  toKey: string
): { start: Date; end: Date } | null {
  const from = istDayUtcRange(fromKey);
  const to = istDayUtcRange(toKey);
  if (!from || !to) return null;
  if (from.start.getTime() > to.start.getTime()) return null;
  return { start: from.start, end: to.end };
}
