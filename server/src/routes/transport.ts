import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { istDayKey } from "../services/engagementCalendar.js";
import {
  addDieselFill,
  createBus,
  deleteBus,
  renameBus,
  deleteDieselFill,
  inclusiveDayCount,
  listTransportSummary,
} from "../services/transportDiesel.js";

const router = Router();

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function monthBounds(day = istDayKey()): { from: string; to: string } {
  const [year, month] = day.split("-").map(Number);
  const last = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

router.get("/transport", async (req, res) => {
  const bounds = monthBounds();
  const from = typeof req.query.from === "string" && dayKey.safeParse(req.query.from).success ? req.query.from : bounds.from;
  const to = typeof req.query.to === "string" && dayKey.safeParse(req.query.to).success ? req.query.to : bounds.to;
  if (inclusiveDayCount(from, to) === 0) {
    res.status(400).json({ error: "Choose a start date on or before the end date" });
    return;
  }
  if (inclusiveDayCount(from, to) > 400) {
    res.status(400).json({ error: "Choose a range of 400 days or less" });
    return;
  }
  res.json(await listTransportSummary(prisma, from, to));
});

router.post("/transport/buses", async (req, res) => {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      vehicleNo: z.string().trim().min(1).max(20),
      kind: z.enum(["BUS", "GENERATOR", "MAGIC"]),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the name, number, and type" });
  const result = await createBus(prisma, parsed.data.name, parsed.data.vehicleNo, parsed.data.kind);
  if ("error" in result) return res.status(400).json({ error: result.error });
  res.json(result.bus);
});

router.patch("/transport/buses/:busId", async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the name" });
  const result = await renameBus(prisma, req.params.busId, parsed.data.name);
  if ("error" in result) return res.status(result.error === "Bus not found" ? 404 : 400).json({ error: result.error });
  res.json(result.bus);
});

router.delete("/transport/buses/:busId", async (req, res) => {
  const result = await deleteBus(prisma, req.params.busId);
  if ("error" in result) return res.status(404).json({ error: result.error });
  res.json({ ok: true });
});

router.post("/transport/fills", async (req, res) => {
  const parsed = z
    .object({
      busId: z.string().min(1),
      filledOn: dayKey,
      litres: z.number().positive().max(5000),
      amountRupees: z
        .number()
        .positive()
        .max(10000000)
        .transform((value) => Math.round(value))
        .refine((value) => value > 0),
      odometerKm: z.number().int().positive().max(9999999).nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the date, litres, and amount. A bus also needs the current km" });
  const result = await addDieselFill(
    prisma,
    parsed.data.busId,
    parsed.data.filledOn,
    parsed.data.litres,
    parsed.data.amountRupees,
    parsed.data.odometerKm ?? null
  );
  if ("error" in result) {
    return res.status(result.error === "Bus not found" ? 404 : 400).json({ error: result.error });
  }
  res.json(result.fill);
});

router.delete("/transport/fills/:fillId", async (req, res) => {
  const result = await deleteDieselFill(prisma, req.params.fillId);
  if ("error" in result) return res.status(404).json({ error: result.error });
  res.json({ ok: true });
});

export default router;
