import type { PrismaClient, SaturdayHolidayRule, SchoolHolidayKind } from "@prisma/client";
import { CACHE_KEY, CACHE_TTL_MS, cacheGet, cacheSet, invalidateHolidays } from "../lib/memoryCache.js";

export const HOLIDAY_SETTINGS_ID = "default";

export type HolidaySettingsDto = {
  sundaysOff: boolean;
  saturdayRule: SaturdayHolidayRule;
};

export type HolidayExceptionDto = {
  id: string;
  date: string;
  kind: SchoolHolidayKind;
  name: string | null;
};

export type ResolvedHoliday = {
  date: string;
  name: string;
  source: "sunday" | "second_saturday" | "saturday" | "extra";
};

export function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function eachIsoDatesInclusive(fromIso: string, toIso: string): string[] {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to || from > to) return [];
  const out: string[] = [];
  const cur = new Date(from);
  while (cur.getTime() <= to.getTime()) {
    out.push(dateToIso(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function utcDayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay();
}

export function isSundayIso(iso: string): boolean {
  return utcDayOfWeek(iso) === 0;
}

export function isSaturdayIso(iso: string): boolean {
  return utcDayOfWeek(iso) === 6;
}

/** Saturday whose date is 8–14 of the month. */
export function isSecondSaturdayIso(iso: string): boolean {
  if (!isSaturdayIso(iso)) return false;
  const day = Number(iso.slice(8, 10));
  return day >= 8 && day <= 14;
}

export function recurringHolidayName(
  iso: string,
  settings: HolidaySettingsDto
): { name: string; source: "sunday" | "second_saturday" | "saturday" } | null {
  if (settings.sundaysOff && isSundayIso(iso)) {
    return { name: "Sunday", source: "sunday" };
  }
  if (settings.saturdayRule === "ALL" && isSaturdayIso(iso)) {
    return { name: "Saturday", source: "saturday" };
  }
  if (settings.saturdayRule === "SECOND" && isSecondSaturdayIso(iso)) {
    return { name: "2nd Saturday", source: "second_saturday" };
  }
  return null;
}

export async function getHolidaySettings(prisma: PrismaClient): Promise<HolidaySettingsDto> {
  const cached = cacheGet<HolidaySettingsDto>(CACHE_KEY.holidaySettings);
  if (cached) return cached;
  const row = await prisma.schoolHolidaySettings.findUnique({
    where: { id: HOLIDAY_SETTINGS_ID },
  });
  const dto: HolidaySettingsDto = row
    ? { sundaysOff: row.sundaysOff, saturdayRule: row.saturdayRule }
    : { sundaysOff: true, saturdayRule: "SECOND" };
  cacheSet(CACHE_KEY.holidaySettings, dto, CACHE_TTL_MS.holidays);
  return dto;
}

export async function updateHolidaySettings(
  prisma: PrismaClient,
  patch: Partial<HolidaySettingsDto>
): Promise<HolidaySettingsDto> {
  const row = await prisma.schoolHolidaySettings.upsert({
    where: { id: HOLIDAY_SETTINGS_ID },
    create: {
      id: HOLIDAY_SETTINGS_ID,
      sundaysOff: patch.sundaysOff ?? true,
      saturdayRule: patch.saturdayRule ?? "SECOND",
    },
    update: {
      ...(patch.sundaysOff != null ? { sundaysOff: patch.sundaysOff } : {}),
      ...(patch.saturdayRule != null ? { saturdayRule: patch.saturdayRule } : {}),
    },
  });
  const dto = { sundaysOff: row.sundaysOff, saturdayRule: row.saturdayRule };
  invalidateHolidays();
  cacheSet(CACHE_KEY.holidaySettings, dto, CACHE_TTL_MS.holidays);
  return dto;
}

function exceptionDto(row: { id: string; date: Date; kind: SchoolHolidayKind; name: string | null }): HolidayExceptionDto {
  return {
    id: row.id,
    date: dateToIso(row.date),
    kind: row.kind,
    name: row.name,
  };
}

export async function listHolidayExceptions(
  prisma: PrismaClient,
  fromIso: string,
  toIso: string
): Promise<HolidayExceptionDto[]> {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return [];
  const toExclusive = new Date(to);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const rows = await prisma.schoolHolidayException.findMany({
    where: { date: { gte: from, lt: toExclusive } },
    orderBy: { date: "asc" },
  });
  return rows.map(exceptionDto);
}

export async function resolveHolidays(
  prisma: PrismaClient,
  fromIso: string,
  toIso: string
): Promise<{
  settings: HolidaySettingsDto;
  holidays: ResolvedHoliday[];
  exceptions: HolidayExceptionDto[];
}> {
  const cacheKey = CACHE_KEY.holidaysResolved(fromIso, toIso);
  const cached = cacheGet<{
    settings: HolidaySettingsDto;
    holidays: ResolvedHoliday[];
    exceptions: HolidayExceptionDto[];
  }>(cacheKey);
  if (cached) return cached;

  const [settings, exceptions] = await Promise.all([
    getHolidaySettings(prisma),
    listHolidayExceptions(prisma, fromIso, toIso),
  ]);
  const byDate = new Map(exceptions.map((e) => [e.date, e]));
  const holidays: ResolvedHoliday[] = [];

  for (const iso of eachIsoDatesInclusive(fromIso, toIso)) {
    const ex = byDate.get(iso);
    if (ex?.kind === "WORKING") continue;
    if (ex?.kind === "EXTRA") {
      holidays.push({
        date: iso,
        name: ex.name?.trim() || "Holiday",
        source: "extra",
      });
      continue;
    }
    const recurring = recurringHolidayName(iso, settings);
    if (recurring) {
      holidays.push({ date: iso, name: recurring.name, source: recurring.source });
    }
  }

  const result = { settings, holidays, exceptions };
  cacheSet(cacheKey, result, CACHE_TTL_MS.holidays);
  return result;
}

export async function holidayNameForDate(
  prisma: PrismaClient,
  iso: string
): Promise<string | null> {
  const { holidays } = await resolveHolidays(prisma, iso, iso);
  return holidays[0]?.name ?? null;
}

export async function upsertHolidayException(
  prisma: PrismaClient,
  input: { date: string; kind: SchoolHolidayKind; name?: string | null }
): Promise<HolidayExceptionDto | { error: string }> {
  const date = parseIsoDate(input.date);
  if (!date) return { error: "date must be YYYY-MM-DD" };
  if (input.kind === "EXTRA") {
    const name = input.name?.trim() ?? "";
    if (!name) return { error: "Holiday name is required" };
    const row = await prisma.schoolHolidayException.upsert({
      where: { date },
      create: { date, kind: "EXTRA", name },
      update: { kind: "EXTRA", name },
    });
    invalidateHolidays();
    return exceptionDto(row);
  }

  const settings = await getHolidaySettings(prisma);
  if (!recurringHolidayName(input.date, settings)) {
    return { error: "Only a Sunday or Saturday holiday can be marked as a working day" };
  }
  const row = await prisma.schoolHolidayException.upsert({
    where: { date },
    create: { date, kind: "WORKING", name: input.name?.trim() || null },
    update: { kind: "WORKING", name: input.name?.trim() || null },
  });
  invalidateHolidays();
  return exceptionDto(row);
}

export async function deleteHolidayException(
  prisma: PrismaClient,
  id: string
): Promise<boolean> {
  try {
    await prisma.schoolHolidayException.delete({ where: { id } });
    invalidateHolidays();
    return true;
  } catch {
    return false;
  }
}
