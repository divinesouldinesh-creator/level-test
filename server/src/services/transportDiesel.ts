import type { PrismaClient } from "@prisma/client";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function inclusiveDayCount(from: string, to: string): number {
  if (!DAY.test(from) || !DAY.test(to) || to < from) return 0;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

function roundLitres(value: number): number {
  return Math.round(value * 100) / 100;
}

type FillReading = {
  id: string;
  busId: string;
  filledOn: string;
  litres: number;
  amountRupees: number;
  odometerKm: number | null;
  createdAt: Date;
};

function readingOrder(a: FillReading, b: FillReading): number {
  return a.filledOn.localeCompare(b.filledOn) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

function previousWithKm(history: FillReading[], index: number): FillReading | undefined {
  for (let i = index - 1; i >= 0; i--) {
    if (history[i]?.odometerKm != null) return history[i];
  }
  return undefined;
}

function mileageFor(fill: FillReading, previous: FillReading | undefined) {
  if (fill.odometerKm == null || previous?.odometerKm == null || fill.litres <= 0 || fill.odometerKm <= previous.odometerKm) {
    return { previousKm: previous?.odometerKm ?? null, kilometres: null as number | null, kmPerLitre: null as number | null };
  }
  const kilometres = fill.odometerKm - previous.odometerKm;
  return { previousKm: previous.odometerKm, kilometres, kmPerLitre: roundLitres(kilometres / fill.litres) };
}

export async function listTransportSummary(db: PrismaClient, from: string, to: string) {
  const [buses, fills] = await Promise.all([
    db.bus.findMany({ orderBy: [{ name: "asc" }, { vehicleNo: "asc" }] }),
    db.dieselFill.findMany({
      orderBy: [{ filledOn: "asc" }, { createdAt: "asc" }],
      select: { id: true, busId: true, filledOn: true, litres: true, amountRupees: true, odometerKm: true, createdAt: true },
    }),
  ]);

  const byBus = new Map<string, FillReading[]>();
  for (const fill of fills) {
    const list = byBus.get(fill.busId) ?? [];
    list.push(fill);
    byBus.set(fill.busId, list);
  }
  for (const list of byBus.values()) list.sort(readingOrder);

  let totalLitresRaw = 0;
  let totalAmount = 0;
  let totalKilometres = 0;
  let measuredLitres = 0;
  const rows = buses.map((bus) => {
    const history = byBus.get(bus.id) ?? [];
    let litres = 0;
    let amountRupees = 0;
    let kilometres = 0;
    let litresForAverage = 0;
    history.forEach((fill, index) => {
      if (fill.filledOn < from || fill.filledOn > to) return;
      litres += fill.litres;
      amountRupees += fill.amountRupees;
      const run = mileageFor(fill, previousWithKm(history, index));
      if (run.kilometres != null) {
        kilometres += run.kilometres;
        litresForAverage += fill.litres;
      }
    });
    totalLitresRaw += litres;
    totalAmount += amountRupees;
    totalKilometres += kilometres;
    measuredLitres += litresForAverage;
    return {
      id: bus.id,
      name: bus.name,
      vehicleNo: bus.vehicleNo,
      kind: bus.kind,
      litres: roundLitres(litres),
      amountRupees,
      kilometres,
      kmPerLitre: litresForAverage > 0 ? roundLitres(kilometres / litresForAverage) : null,
    };
  });

  const totalLitres = roundLitres(totalLitresRaw);
  const names = new Map(buses.map((bus) => [bus.id, bus]));
  const inRange = fills
    .filter((fill) => fill.filledOn >= from && fill.filledOn <= to)
    .sort((a, b) => b.filledOn.localeCompare(a.filledOn) || b.createdAt.getTime() - a.createdAt.getTime());

  return {
    from,
    to,
    totalLitres,
    totalAmount,
    totalKilometres,
    kmPerLitre: measuredLitres > 0 ? roundLitres(totalKilometres / measuredLitres) : null,
    buses: rows,
    fills: inRange.map((fill) => {
      const history = byBus.get(fill.busId) ?? [];
      const index = history.findIndex((row) => row.id === fill.id);
      const run = mileageFor(fill, previousWithKm(history, index));
      return {
        id: fill.id,
        busId: fill.busId,
        busName: names.get(fill.busId)?.name ?? "",
        vehicleNo: names.get(fill.busId)?.vehicleNo ?? "",
        filledOn: fill.filledOn,
        litres: roundLitres(fill.litres),
        amountRupees: fill.amountRupees,
        odometerKm: fill.odometerKm,
        previousKm: run.previousKm,
        kilometres: run.kilometres,
        kmPerLitre: run.kmPerLitre,
      };
    }),
  };
}

export async function createBus(
  db: PrismaClient,
  name: string,
  vehicleNo: string,
  kind: "BUS" | "GENERATOR" | "MAGIC"
) {
  const vehicle = vehicleNo.trim().toUpperCase();
  const existing = await db.bus.findUnique({ where: { vehicleNo: vehicle }, select: { id: true } });
  if (existing) return { error: "This vehicle number is already saved" as const };
  const bus = await db.bus.create({
    data: { name: name.trim(), vehicleNo: vehicle, kind },
  });
  return { bus };
}

export async function renameBus(db: PrismaClient, busId: string, name: string) {
  const bus = await db.bus.findUnique({ where: { id: busId }, select: { id: true } });
  if (!bus) return { error: "Bus not found" as const };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter the name" as const };
  const updated = await db.bus.update({ where: { id: busId }, data: { name: trimmed } });
  return { bus: updated };
}

export async function deleteBus(db: PrismaClient, busId: string) {
  const bus = await db.bus.findUnique({ where: { id: busId }, select: { id: true } });
  if (!bus) return { error: "Bus not found" as const };
  await db.bus.delete({ where: { id: busId } });
  return { ok: true as const };
}

export async function addDieselFill(
  db: PrismaClient,
  busId: string,
  filledOn: string,
  litres: number,
  amountRupees: number,
  odometerKm: number | null
) {
  const bus = await db.bus.findUnique({ where: { id: busId }, select: { id: true, kind: true } });
  if (!bus) return { error: "Bus not found" as const };
  if (bus.kind === "GENERATOR") {
    const fill = await db.dieselFill.create({
      data: { busId, filledOn, litres, amountRupees, odometerKm: null },
    });
    return { fill };
  }
  if (odometerKm == null) return { error: "Enter the current km" as const };
  const [previous, next] = await Promise.all([
    db.dieselFill.findFirst({
      where: { busId, filledOn: { lte: filledOn }, odometerKm: { not: null } },
      orderBy: [{ filledOn: "desc" }, { createdAt: "desc" }],
      select: { odometerKm: true },
    }),
    db.dieselFill.findFirst({
      where: { busId, filledOn: { gt: filledOn }, odometerKm: { not: null } },
      orderBy: [{ filledOn: "asc" }, { createdAt: "asc" }],
      select: { odometerKm: true },
    }),
  ]);
  if (previous?.odometerKm != null && odometerKm <= previous.odometerKm) {
    return { error: `Current km must be more than the last reading of ${previous.odometerKm} km` as const };
  }
  if (next?.odometerKm != null && odometerKm >= next.odometerKm) {
    return { error: `Current km must be less than the next reading of ${next.odometerKm} km` as const };
  }
  const fill = await db.dieselFill.create({
    data: { busId, filledOn, litres, amountRupees, odometerKm },
  });
  return { fill };
}

export async function deleteDieselFill(db: PrismaClient, fillId: string) {
  const fill = await db.dieselFill.findUnique({ where: { id: fillId }, select: { id: true } });
  if (!fill) return { error: "Diesel entry not found" as const };
  await db.dieselFill.delete({ where: { id: fillId } });
  return { ok: true as const };
}
