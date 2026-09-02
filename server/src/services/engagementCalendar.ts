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
