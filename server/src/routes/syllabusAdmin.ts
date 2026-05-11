import { Router } from "express";
import multer from "multer";
import fs from "fs";
import * as XLSX from "xlsx";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import {
  extractTextFromDocx,
  parseQuestionBlocks,
  parseDifficulty,
} from "../services/wordImport.js";

const router = Router();
router.use(authMiddleware, requireRole("ADMIN"));

const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 5 * 1024 * 1024 } });

function syllabusContentHash(topicId: string, stem: string, correctOption: number): string {
  const payload = `${topicId}|${stem.replace(/\s+/g, " ").trim().toLowerCase()}|${correctOption}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function normHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, "");
}

type SheetQuestion = {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  /** Optional per-row chapter (under the chosen subject). */
  chapterName?: string;
  /** Optional per-row topic (under the resolved chapter). */
  topicName?: string;
  /** 1-based row number for error messages (matches Excel display). */
  rowNumber: number;
};

function parseQuestionSheetBuffer(buf: Buffer): SheetQuestion[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  if (!wb.SheetNames.length) throw new Error("Empty workbook");
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const out: SheetQuestion[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const mapped = new Map<string, string>();
    for (const [k, v] of Object.entries(raw))
      mapped.set(normHeader(String(k)), String(v ?? "").trim());
    const stem = mapped.get("question") ?? mapped.get("stem") ?? "";
    const optionA = mapped.get("optiona") ?? mapped.get("a") ?? "";
    const optionB = mapped.get("optionb") ?? mapped.get("b") ?? "";
    const optionC = mapped.get("optionc") ?? mapped.get("c") ?? "";
    const optionD = mapped.get("optiond") ?? mapped.get("d") ?? "";
    const answerRaw = (mapped.get("answer") ?? "").trim().toUpperCase();
    const chapterName =
      mapped.get("chapter") ?? mapped.get("chaptername") ?? "";
    const topicName =
      mapped.get("topic") ?? mapped.get("topicname") ?? "";
    if (!stem && !optionA && !optionB && !optionC && !optionD && !answerRaw) continue;
    if (!stem || !optionA || !optionB || !optionC || !optionD || !answerRaw) {
      throw new Error(`Row ${i + 2}: question, optionA-D and answer are required`);
    }
    const letter = answerRaw[0] ?? "";
    const idx = letter.charCodeAt(0) - 65;
    if (idx < 0 || idx > 3) throw new Error(`Row ${i + 2}: answer must be A/B/C/D`);
    const diffRaw = (mapped.get("difficulty") ?? "").trim().toUpperCase();
    const difficulty: "EASY" | "MEDIUM" | "HARD" | undefined =
      diffRaw === "EASY" || diffRaw === "E"
        ? "EASY"
        : diffRaw === "HARD" || diffRaw === "H"
        ? "HARD"
        : diffRaw === "MEDIUM" || diffRaw === "M"
        ? "MEDIUM"
        : undefined;
    out.push({
      stem,
      optionA,
      optionB,
      optionC,
      optionD,
      correctOption: idx,
      difficulty,
      chapterName: chapterName.trim() || undefined,
      topicName: topicName.trim() || undefined,
      rowNumber: i + 2,
    });
  }
  if (!out.length) throw new Error("No valid question rows found in file");
  return out;
}

// =========================================================================
// Subjects
// =========================================================================

router.get("/subjects", async (_req, res) => {
  const list = await prisma.syllabusSubject.findMany({
    orderBy: [{ schoolClass: { name: "asc" } }, { name: "asc" }],
    include: {
      schoolClass: { select: { id: true, name: true, grade: true } },
      chapters: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        include: {
          topicParticipations: {
            orderBy: { sortOrder: "asc" },
            include: { topic: true },
          },
          _count: { select: { questions: true } },
        },
      },
      _count: { select: { chapters: true } },
    },
  });
  res.json(list);
});

router.post("/subjects", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    schoolClassId: z.string().min(1),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const cls = await prisma.schoolClass.findUnique({ where: { id: p.data.schoolClassId } });
  if (!cls) return res.status(400).json({ error: "Class not found" });
  try {
    const sub = await prisma.syllabusSubject.create({
      data: {
        name: p.data.name.trim(),
        code: p.data.code?.trim() || null,
        schoolClassId: p.data.schoolClassId,
      },
    });
    res.json(sub);
  } catch (e) {
    res.status(400).json({ error: "Subject name already exists for this class" });
  }
});

router.patch("/subjects/:id", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    code: z.string().nullable().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const next = await prisma.syllabusSubject.update({
    where: { id: req.params.id },
    data: {
      ...(p.data.name !== undefined ? { name: p.data.name.trim() } : {}),
      ...(p.data.code !== undefined
        ? { code: p.data.code === null ? null : p.data.code.trim() || null }
        : {}),
    },
  });
  res.json(next);
});

router.delete("/subjects/:id", async (req, res) => {
  try {
    await prisma.syllabusSubject.delete({ where: { id: req.params.id } });
  } catch {
    return res.status(404).json({ error: "Subject not found" });
  }
  res.json({ ok: true });
});

// =========================================================================
// Chapters
// =========================================================================

router.post("/subjects/:subjectId/chapters", async (req, res) => {
  const schema = z.object({ name: z.string().min(1), order: z.number().int().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const subjectId = req.params.subjectId;
  const subject = await prisma.syllabusSubject.findUnique({ where: { id: subjectId } });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  const agg = await prisma.chapter.aggregate({
    where: { syllabusSubjectId: subjectId },
    _max: { order: true },
  });
  const order = p.data.order ?? (agg._max.order ?? -1) + 1;
  try {
    const chapter = await prisma.chapter.create({
      data: {
        syllabusSubjectId: subjectId,
        name: p.data.name.trim(),
        order,
      },
    });
    res.json(chapter);
  } catch {
    res.status(400).json({ error: "Chapter name already exists in this subject" });
  }
});

router.patch("/chapters/:id", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    order: z.number().int().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const ch = await prisma.chapter.update({
    where: { id: req.params.id },
    data: {
      ...(p.data.name !== undefined ? { name: p.data.name.trim() } : {}),
      ...(p.data.order !== undefined ? { order: p.data.order } : {}),
    },
  });
  res.json(ch);
});

router.delete("/chapters/:id", async (req, res) => {
  try {
    await prisma.chapter.delete({ where: { id: req.params.id } });
  } catch {
    return res.status(404).json({ error: "Chapter not found" });
  }
  res.json({ ok: true });
});

// =========================================================================
// Syllabus topics + chapter weightage
// =========================================================================

router.get("/topics", async (_req, res) => {
  const list = await prisma.syllabusTopic.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  res.json(list);
});

router.post("/chapters/:chapterId/topics", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    weightPct: z.number().int().min(0).max(100).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const chapter = await prisma.chapter.findUnique({ where: { id: req.params.chapterId } });
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });
  const trimmed = p.data.name.trim();
  if (!trimmed) return res.status(400).json({ error: "Name required" });

  const existing = await prisma.syllabusTopic.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  const topic = existing
    ? existing
    : await prisma.syllabusTopic.create({ data: { name: trimmed } });

  const agg = await prisma.chapterTopicParticipation.aggregate({
    where: { chapterId: chapter.id },
    _max: { sortOrder: true },
  });
  const sortOrder = (agg._max.sortOrder ?? -1) + 1;

  await prisma.chapterTopicParticipation.upsert({
    where: { chapterId_topicId: { chapterId: chapter.id, topicId: topic.id } },
    create: {
      chapterId: chapter.id,
      topicId: topic.id,
      weightPct: p.data.weightPct ?? 0,
      sortOrder,
    },
    update: {},
  });
  res.json(topic);
});

router.put("/chapters/:chapterId/topics", async (req, res) => {
  const schema = z.array(
    z.object({
      topicId: z.string(),
      weightPct: z.number().int().min(0).max(100).optional(),
      sortOrder: z.number().int().optional(),
    })
  );
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const chapterId = req.params.chapterId;
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });

  await prisma.$transaction([
    prisma.chapterTopicParticipation.deleteMany({ where: { chapterId } }),
    ...p.data.map((row, i) =>
      prisma.chapterTopicParticipation.create({
        data: {
          chapterId,
          topicId: row.topicId,
          weightPct: row.weightPct ?? 0,
          sortOrder: row.sortOrder ?? i,
        },
      })
    ),
  ]);
  res.json({ ok: true });
});

/**
 * Bulk add topics + weightages for a chapter.
 *
 *   { items: [{ name, weightPct }], mode: "replace" | "merge" }
 *
 * - "replace" wipes all existing participations for the chapter, then upserts
 *   each topic by name (case-insensitive) and creates fresh participation rows
 *   in the order given.
 * - "merge" leaves untouched topics alone, upserts each provided topic, and
 *   sets the weightage on its participation row.
 */
router.post("/chapters/:chapterId/topics/bulk", async (req, res) => {
  const schema = z.object({
    items: z
      .array(
        z.object({
          name: z.string().min(1),
          weightPct: z.number().int().min(0).max(100).optional(),
        })
      )
      .min(1),
    mode: z.enum(["replace", "merge"]).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const chapterId = req.params.chapterId;
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });

  const mode = p.data.mode ?? "replace";

  const cleaned: { name: string; weightPct: number }[] = [];
  const seen = new Set<string>();
  for (const it of p.data.items) {
    const name = it.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ name, weightPct: it.weightPct ?? 0 });
  }
  if (cleaned.length === 0) return res.status(400).json({ error: "No valid rows" });

  // Resolve topic IDs OUTSIDE the transaction. Topic rows are global so this
  // is safe to do unbatched, and pulling these network round-trips out of the
  // transaction prevents the interactive-tx timeout (P2028) we kept hitting
  // when Supabase added latency to each lookup.
  //
  // 1. One bulk findMany for any topics that already exist (case-insensitive).
  // 2. Create the missing topics in parallel, ignoring duplicate-key races.
  const existingTopics = await prisma.syllabusTopic.findMany({
    where: { OR: cleaned.map((c) => ({ name: { equals: c.name, mode: "insensitive" as const } })) },
    select: { id: true, name: true },
  });
  const byLower = new Map<string, string>();
  for (const t of existingTopics) byLower.set(t.name.toLowerCase(), t.id);

  const toCreate = cleaned.filter((c) => !byLower.has(c.name.toLowerCase()));
  if (toCreate.length > 0) {
    const created = await Promise.all(
      toCreate.map(async (c) => {
        try {
          return await prisma.syllabusTopic.create({
            data: { name: c.name },
            select: { id: true, name: true },
          });
        } catch {
          // Lost a race against a parallel insert with the same name.
          // Re-fetch and use whichever row won.
          const fallback = await prisma.syllabusTopic.findFirst({
            where: { name: { equals: c.name, mode: "insensitive" } },
            select: { id: true, name: true },
          });
          if (!fallback) throw new Error(`Failed to upsert topic "${c.name}"`);
          return fallback;
        }
      })
    );
    for (const t of created) byLower.set(t.name.toLowerCase(), t.id);
  }

  const topicIds = cleaned.map((c) => {
    const id = byLower.get(c.name.toLowerCase());
    if (!id) throw new Error(`Topic id missing for "${c.name}"`);
    return id;
  });

  // Now the participation writes — small, predictable, and we use the array
  // form of $transaction (one round-trip per op, all-or-nothing at the DB
  // level — no interactive-transaction timeout to worry about).
  if (mode === "replace") {
    await prisma.$transaction([
      prisma.chapterTopicParticipation.deleteMany({ where: { chapterId } }),
      ...cleaned.map((it, i) =>
        prisma.chapterTopicParticipation.create({
          data: {
            chapterId,
            topicId: topicIds[i],
            weightPct: it.weightPct,
            sortOrder: i,
          },
        })
      ),
    ]);
  } else {
    const aggSort = await prisma.chapterTopicParticipation.aggregate({
      where: { chapterId },
      _max: { sortOrder: true },
    });
    let nextSort = (aggSort._max.sortOrder ?? -1) + 1;
    const ops = cleaned.map((it, i) =>
      prisma.chapterTopicParticipation.upsert({
        where: { chapterId_topicId: { chapterId, topicId: topicIds[i] } },
        update: { weightPct: it.weightPct },
        create: {
          chapterId,
          topicId: topicIds[i],
          weightPct: it.weightPct,
          sortOrder: nextSort++,
        },
      })
    );
    await prisma.$transaction(ops);
  }

  res.json({ ok: true, mode, count: cleaned.length });
});

router.patch("/topics/:topicId", async (req, res) => {
  const schema = z.object({ name: z.string().min(1) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const topicId = req.params.topicId;
  const trimmed = p.data.name.trim();
  const dup = await prisma.syllabusTopic.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" }, id: { not: topicId } },
  });
  if (dup) return res.status(400).json({ error: "Topic name already exists" });
  const topic = await prisma.syllabusTopic.update({
    where: { id: topicId },
    data: { name: trimmed },
  });
  res.json(topic);
});

router.delete("/topics/:topicId", async (req, res) => {
  try {
    await prisma.syllabusTopic.delete({ where: { id: req.params.topicId } });
  } catch {
    return res.status(404).json({ error: "Topic not found" });
  }
  res.json({ ok: true });
});

// =========================================================================
// Questions CRUD
// =========================================================================

router.get("/questions", async (req, res) => {
  const chapterId = req.query.chapterId as string | undefined;
  const topicId = req.query.topicId as string | undefined;
  const difficulty = req.query.difficulty as string | undefined;
  const where: Record<string, unknown> = {};
  if (chapterId) where.chapterId = chapterId;
  if (topicId) where.topicId = topicId;
  if (difficulty && (difficulty === "EASY" || difficulty === "MEDIUM" || difficulty === "HARD"))
    where.difficulty = difficulty;
  const list = await prisma.syllabusQuestion.findMany({
    where,
    take: 200,
    orderBy: { createdAt: "desc" },
    include: {
      topic: true,
      chapter: { include: { syllabusSubject: true } },
    },
  });
  res.json(list);
});

router.post("/questions", async (req, res) => {
  const schema = z.object({
    chapterId: z.string(),
    topicId: z.string(),
    stem: z.string().min(1),
    optionA: z.string().min(1),
    optionB: z.string().min(1),
    optionC: z.string().min(1),
    optionD: z.string().min(1),
    correctOption: z.number().int().min(0).max(3),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const hash = syllabusContentHash(p.data.topicId, p.data.stem, p.data.correctOption);
  const dup = await prisma.syllabusQuestion.findUnique({ where: { contentHash: hash } });
  if (dup) return res.status(409).json({ error: "Duplicate question", id: dup.id });
  const q = await prisma.syllabusQuestion.create({
    data: {
      chapterId: p.data.chapterId,
      topicId: p.data.topicId,
      stem: p.data.stem,
      optionA: p.data.optionA,
      optionB: p.data.optionB,
      optionC: p.data.optionC,
      optionD: p.data.optionD,
      correctOption: p.data.correctOption,
      difficulty: p.data.difficulty ?? "MEDIUM",
      contentHash: hash,
      createdById: req.user!.sub,
    },
  });
  res.json(q);
});

router.patch("/questions/:id", async (req, res) => {
  const schema = z.object({
    stem: z.string().optional(),
    optionA: z.string().optional(),
    optionB: z.string().optional(),
    optionC: z.string().optional(),
    optionD: z.string().optional(),
    correctOption: z.number().int().min(0).max(3).optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const existing = await prisma.syllabusQuestion.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Question not found" });

  const nextStem = p.data.stem ?? existing.stem;
  const nextCorrect = p.data.correctOption ?? existing.correctOption;
  const nextHash = syllabusContentHash(existing.topicId, nextStem, nextCorrect);
  const dup = await prisma.syllabusQuestion.findUnique({ where: { contentHash: nextHash } });
  if (dup && dup.id !== existing.id)
    return res.status(409).json({ error: "Duplicate question", id: dup.id });

  const q = await prisma.syllabusQuestion.update({
    where: { id: existing.id },
    data: { ...p.data, contentHash: nextHash },
  });
  res.json(q);
});

router.delete("/questions/:id", async (req, res) => {
  try {
    await prisma.syllabusQuestion.delete({ where: { id: req.params.id } });
  } catch {
    return res.status(404).json({ error: "Question not found" });
  }
  res.json({ ok: true });
});

// =========================================================================
// Imports — paste / docx / xlsx (mirror the skill-side UX)
// =========================================================================

type ImportParsed = {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  chapterName?: string;
  topicName?: string;
  rowNumber?: number;
};

async function importParsedQuestions(
  parsed: ImportParsed[],
  args: {
    /** Required — limits chapter lookups to this subject. */
    syllabusSubjectId: string;
    /** Optional fallback chapter when a row has no `chapter` column. */
    chapterId?: string;
    /** Optional fallback topic when a row has no `topic` column. */
    topicId?: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    mode: "insert" | "sync" | "replace";
    createdById: string;
    filename: string;
    autoCreate: boolean;
  }
): Promise<{ imported: number; updated: number; skipped: number; errors: string[]; batchId: string }> {
  // Performance note: Supabase Tokyo round-trip is ~1s. The previous version
  // did 3-4 sequential queries per row, so 100 rows = 5+ minutes. This pass
  // batches every lookup and uses createMany so a 100-row upload is
  // ~6-10 round trips total instead of ~400.

  // ---------------------------------------------------------------------
  // 1. Resolve chapter names → ids (one findMany + one parallel create batch)
  // ---------------------------------------------------------------------
  const chapterNamesNeeded = new Set<string>();
  for (const p of parsed) if (p.chapterName) chapterNamesNeeded.add(p.chapterName);
  const chapterByLowerName = new Map<string, string>();
  if (chapterNamesNeeded.size > 0) {
    const found = await prisma.chapter.findMany({
      where: {
        syllabusSubjectId: args.syllabusSubjectId,
        OR: [...chapterNamesNeeded].map((n) => ({ name: { equals: n, mode: "insensitive" as const } })),
      },
      select: { id: true, name: true },
    });
    for (const c of found) chapterByLowerName.set(c.name.toLowerCase(), c.id);

    if (args.autoCreate) {
      const missing = [...chapterNamesNeeded].filter((n) => !chapterByLowerName.has(n.toLowerCase()));
      if (missing.length > 0) {
        const aggMax = await prisma.chapter.aggregate({
          where: { syllabusSubjectId: args.syllabusSubjectId },
          _max: { order: true },
        });
        const baseOrder = (aggMax._max.order ?? -1) + 1;
        const created = await Promise.all(
          missing.map((name, i) =>
            prisma.chapter.create({
              data: {
                syllabusSubjectId: args.syllabusSubjectId,
                name,
                order: baseOrder + i,
              },
              select: { id: true, name: true },
            })
          )
        );
        for (const c of created) chapterByLowerName.set(c.name.toLowerCase(), c.id);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 2. Resolve topic names → ids (one findMany + one parallel create batch)
  // ---------------------------------------------------------------------
  const topicNamesNeeded = new Set<string>();
  for (const p of parsed) if (p.topicName) topicNamesNeeded.add(p.topicName);
  const topicByLowerName = new Map<string, string>();
  if (topicNamesNeeded.size > 0) {
    const found = await prisma.syllabusTopic.findMany({
      where: { OR: [...topicNamesNeeded].map((n) => ({ name: { equals: n, mode: "insensitive" as const } })) },
      select: { id: true, name: true },
    });
    for (const t of found) topicByLowerName.set(t.name.toLowerCase(), t.id);

    if (args.autoCreate) {
      const missing = [...topicNamesNeeded].filter((n) => !topicByLowerName.has(n.toLowerCase()));
      if (missing.length > 0) {
        const created = await Promise.all(
          missing.map(async (name) => {
            try {
              const c = await prisma.syllabusTopic.create({ data: { name }, select: { id: true, name: true } });
              return c;
            } catch {
              return prisma.syllabusTopic.findFirst({
                where: { name: { equals: name, mode: "insensitive" } },
                select: { id: true, name: true },
              });
            }
          })
        );
        for (const c of created) if (c) topicByLowerName.set(c.name.toLowerCase(), c.id);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 3. For each row decide its (chapterId, topicId) once. Skip rows we
  //    can't resolve and keep their reasons for the response.
  // ---------------------------------------------------------------------
  type Resolved = ImportParsed & {
    chapterId?: string;
    topicId?: string;
    skipReason?: string;
  };
  const resolvedRows: Resolved[] = parsed.map((pq) => {
    const rowLabel = pq.rowNumber ? `Row ${pq.rowNumber}` : "Row";
    let chapterId: string | undefined;
    if (pq.chapterName) {
      chapterId = chapterByLowerName.get(pq.chapterName.toLowerCase());
      if (!chapterId) {
        return {
          ...pq,
          skipReason: `${rowLabel}: chapter "${pq.chapterName}" not found.${
            args.autoCreate ? "" : " Tick \"Auto-create\" or add it on the Syllabus Curriculum page first."
          }`,
        };
      }
    } else if (args.chapterId) {
      chapterId = args.chapterId;
    } else {
      return {
        ...pq,
        skipReason: `${rowLabel}: no chapter — add a "chapter" column or pick a fallback chapter in the form.`,
      };
    }

    let topicId: string | undefined;
    if (pq.topicName) {
      topicId = topicByLowerName.get(pq.topicName.toLowerCase());
      if (!topicId) {
        return {
          ...pq,
          skipReason: `${rowLabel}: topic "${pq.topicName}" not found.${
            args.autoCreate ? "" : " Tick \"Auto-create\" or add it under the chapter first."
          }`,
        };
      }
    } else if (args.topicId) {
      topicId = args.topicId;
    } else {
      return {
        ...pq,
        skipReason: `${rowLabel}: no topic — add a "topic" column or pick a fallback topic in the form.`,
      };
    }

    return { ...pq, chapterId, topicId };
  });

  const validRows = resolvedRows.filter((r): r is Resolved & { chapterId: string; topicId: string } =>
    !r.skipReason && !!r.chapterId && !!r.topicId
  );

  // ---------------------------------------------------------------------
  // 4. "Replace" mode: a single deleteMany that targets only the
  //    (chapter, topic) pairs the upload actually touches.
  // ---------------------------------------------------------------------
  if (args.mode === "replace" && validRows.length > 0) {
    const pairs = new Set<string>();
    for (const r of validRows) pairs.add(`${r.chapterId}::${r.topicId}`);
    const orClauses = [...pairs].map((pair) => {
      const [chapterId, topicId] = pair.split("::");
      return { chapterId, topicId };
    });
    await prisma.syllabusQuestion.deleteMany({ where: { OR: orClauses } });
  }

  // ---------------------------------------------------------------------
  // 5. Bulk-ensure ChapterTopicParticipation for every (chapter, topic)
  //    pair the upload uses. One findMany + one createMany.
  // ---------------------------------------------------------------------
  if (validRows.length > 0) {
    const pairKeys = new Set<string>();
    for (const r of validRows) pairKeys.add(`${r.chapterId}::${r.topicId}`);
    const pairList = [...pairKeys].map((pair) => {
      const [chapterId, topicId] = pair.split("::");
      return { chapterId, topicId };
    });
    const existingParts = await prisma.chapterTopicParticipation.findMany({
      where: { OR: pairList },
      select: { chapterId: true, topicId: true },
    });
    const existingPartSet = new Set(existingParts.map((p) => `${p.chapterId}::${p.topicId}`));
    const missingParts = pairList.filter((p) => !existingPartSet.has(`${p.chapterId}::${p.topicId}`));
    if (missingParts.length > 0) {
      const chaptersInvolved = [...new Set(missingParts.map((p) => p.chapterId))];
      const aggs = await Promise.all(
        chaptersInvolved.map((cid) =>
          prisma.chapterTopicParticipation
            .aggregate({ where: { chapterId: cid }, _max: { sortOrder: true } })
            .then((a) => [cid, a._max.sortOrder ?? -1] as const)
        )
      );
      const baseByChapter = new Map<string, number>(aggs);
      const counterByChapter = new Map<string, number>();
      const data = missingParts.map((p) => {
        const cur = counterByChapter.get(p.chapterId) ?? 0;
        counterByChapter.set(p.chapterId, cur + 1);
        return {
          chapterId: p.chapterId,
          topicId: p.topicId,
          weightPct: 0,
          sortOrder: (baseByChapter.get(p.chapterId) ?? -1) + 1 + cur,
        };
      });
      await prisma.chapterTopicParticipation.createMany({ data, skipDuplicates: true });
    }
  }

  // ---------------------------------------------------------------------
  // 6. Bulk-fetch existing questions we might collide with.
  // ---------------------------------------------------------------------
  const allHashes = validRows.map((r) => syllabusContentHash(r.topicId, r.stem, r.correctOption));
  const existingByHash = new Map<string, string>();
  if (allHashes.length > 0) {
    const found = await prisma.syllabusQuestion.findMany({
      where: { contentHash: { in: allHashes } },
      select: { id: true, contentHash: true },
    });
    for (const f of found) existingByHash.set(f.contentHash, f.id);
  }

  // For "sync" mode also bulk-fetch by (topicId, stem) so we can update in
  // place when the answer index changed.
  const existingByTopicStem = new Map<string, string>();
  if (args.mode === "sync" && validRows.length > 0) {
    const topicIds = [...new Set(validRows.map((r) => r.topicId))];
    const stems = [...new Set(validRows.map((r) => r.stem))];
    const found = await prisma.syllabusQuestion.findMany({
      where: { topicId: { in: topicIds }, stem: { in: stems } },
      select: { id: true, topicId: true, stem: true },
    });
    for (const f of found) existingByTopicStem.set(`${f.topicId}::${f.stem}`, f.id);
  }

  // ---------------------------------------------------------------------
  // 7. Decide what to insert vs update. Track in-batch dedupe via
  //    `existingByHash` so two rows with the same hash don't both insert.
  // ---------------------------------------------------------------------
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const r of resolvedRows) {
    if (r.skipReason) {
      skipped++;
      errors.push(r.skipReason);
    }
  }

  type NewRow = {
    chapterId: string;
    topicId: string;
    stem: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctOption: number;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    contentHash: string;
    createdById: string;
  };
  const newRows: NewRow[] = [];
  const updatePromises: Promise<unknown>[] = [];

  for (const r of validRows) {
    const diff = r.difficulty ?? args.difficulty;
    const hash = syllabusContentHash(r.topicId, r.stem, r.correctOption);

    if (args.mode === "sync") {
      const existingId = existingByTopicStem.get(`${r.topicId}::${r.stem}`);
      if (existingId) {
        const clashId = existingByHash.get(hash);
        if (clashId && clashId !== existingId) {
          skipped++;
          continue;
        }
        updatePromises.push(
          prisma.syllabusQuestion.update({
            where: { id: existingId },
            data: {
              chapterId: r.chapterId,
              topicId: r.topicId,
              stem: r.stem,
              optionA: r.optionA,
              optionB: r.optionB,
              optionC: r.optionC,
              optionD: r.optionD,
              correctOption: r.correctOption,
              difficulty: diff,
              contentHash: hash,
            },
          })
        );
        updated++;
        continue;
      }
    }

    if (existingByHash.has(hash)) {
      skipped++;
      continue;
    }
    newRows.push({
      chapterId: r.chapterId,
      topicId: r.topicId,
      stem: r.stem,
      optionA: r.optionA,
      optionB: r.optionB,
      optionC: r.optionC,
      optionD: r.optionD,
      correctOption: r.correctOption,
      difficulty: diff,
      contentHash: hash,
      createdById: args.createdById,
    });
    // Mark this hash as taken so two rows from the same file with the same
    // content don't both try to insert.
    existingByHash.set(hash, "__pending__");
    imported++;
  }

  // ---------------------------------------------------------------------
  // 8. Run updates and bulk insert in parallel.
  // ---------------------------------------------------------------------
  const writes: Promise<unknown>[] = [...updatePromises];
  if (newRows.length > 0) {
    writes.push(prisma.syllabusQuestion.createMany({ data: newRows, skipDuplicates: true }));
  }
  if (writes.length > 0) {
    const settled = await Promise.allSettled(writes);
    for (const s of settled) {
      if (s.status === "rejected") {
        errors.push(String(s.reason));
        // Don't try to reconcile counters — the totals are best-effort.
      }
    }
  }

  // ---------------------------------------------------------------------
  // 9. Record the import audit row.
  // ---------------------------------------------------------------------
  const batch = await prisma.syllabusQuestionImport.create({
    data: {
      filename: args.filename,
      uploadedById: args.createdById,
      importedCount: imported + updated,
      skippedDuplicates: skipped,
      errorsJson: errors.length ? JSON.stringify(errors.slice(0, 20)) : null,
    },
  });
  return { imported, updated, skipped, errors, batchId: batch.id };
}

router.post("/questions/import-text", async (req, res) => {
  const schema = z.object({
    chapterId: z.string(),
    topicId: z.string(),
    text: z.string(),
    mode: z.enum(["insert", "sync", "replace"]).optional(),
    difficulty: z.string().optional(),
    dryRun: z.boolean().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const parsed = parseQuestionBlocks(p.data.text);
  if (p.data.dryRun) {
    return res.json({ dryRun: true, parseCount: parsed.length, questions: parsed });
  }

  const chapter = await prisma.chapter.findUnique({ where: { id: p.data.chapterId } });
  if (!chapter) return res.status(400).json({ error: "Chapter not found" });

  const result = await importParsedQuestions(parsed, {
    syllabusSubjectId: chapter.syllabusSubjectId,
    chapterId: p.data.chapterId,
    topicId: p.data.topicId,
    difficulty: parseDifficulty(p.data.difficulty),
    mode: p.data.mode ?? "insert",
    createdById: req.user!.sub,
    filename: "syllabus-paste-import",
    autoCreate: false,
  });
  res.json({
    batchId: result.batchId,
    mode: p.data.mode ?? "insert",
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
    parseCount: parsed.length,
    errors: result.errors,
  });
});

router.post("/questions/import", upload.single("file"), async (req, res) => {
  const schema = z.object({
    chapterId: z.string(),
    topicId: z.string(),
    difficulty: z.string().optional(),
    mode: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res
      .status(400)
      .json({ error: p.success ? "file required" : p.error.flatten() });
  }
  const buf = fs.readFileSync(req.file.path);
  const originalname = req.file.originalname;
  fs.unlink(req.file.path, () => {});

  let text: string;
  try {
    text = await extractTextFromDocx(buf);
  } catch {
    return res.status(400).json({ error: "Could not read document" });
  }
  const parsed = parseQuestionBlocks(text);
  const modeRaw = String(p.data.mode ?? "insert").toLowerCase();
  const mode: "insert" | "sync" | "replace" =
    modeRaw === "sync" || modeRaw === "replace" ? (modeRaw as "sync" | "replace") : "insert";
  const chapter = await prisma.chapter.findUnique({ where: { id: p.data.chapterId } });
  if (!chapter) return res.status(400).json({ error: "Chapter not found" });
  const result = await importParsedQuestions(parsed, {
    syllabusSubjectId: chapter.syllabusSubjectId,
    chapterId: p.data.chapterId,
    topicId: p.data.topicId,
    difficulty: parseDifficulty(p.data.difficulty),
    mode,
    createdById: req.user!.sub,
    filename: originalname,
    autoCreate: false,
  });
  res.json({
    batchId: result.batchId,
    mode,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
    parseCount: parsed.length,
    errors: result.errors,
  });
});

router.post("/questions/import-sheet", upload.single("file"), async (req, res) => {
  const schema = z.object({
    /** Required so we can scope chapter lookups to one subject. */
    syllabusSubjectId: z.string().optional(),
    /** Optional fallback when a row has no `chapter` column. If set, we use
     *  this chapter's syllabusSubjectId when `syllabusSubjectId` is omitted. */
    chapterId: z.string().optional(),
    /** Optional fallback when a row has no `topic` column. */
    topicId: z.string().optional(),
    difficulty: z.string().optional(),
    mode: z.string().optional(),
    /** "1" / "true" → create chapters and topics that aren't found yet. */
    autoCreate: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res
      .status(400)
      .json({ error: p.success ? "file required" : p.error.flatten() });
  }
  const buf = fs.readFileSync(req.file.path);
  const originalname = req.file.originalname;
  fs.unlink(req.file.path, () => {});

  let parsed: SheetQuestion[];
  try {
    parsed = parseQuestionSheetBuffer(buf);
  } catch (e) {
    return res.status(400).json({ error: String(e) });
  }
  const modeRaw = String(p.data.mode ?? "insert").toLowerCase();
  const mode: "insert" | "sync" | "replace" =
    modeRaw === "sync" || modeRaw === "replace" ? (modeRaw as "sync" | "replace") : "insert";
  const autoCreate = p.data.autoCreate === "1" || p.data.autoCreate === "true";

  // We need a subject to scope chapter lookups. Either the client sent it,
  // or we derive it from the fallback chapter.
  let syllabusSubjectId = p.data.syllabusSubjectId?.trim() || "";
  if (!syllabusSubjectId && p.data.chapterId) {
    const fallbackChapter = await prisma.chapter.findUnique({
      where: { id: p.data.chapterId },
      select: { syllabusSubjectId: true },
    });
    if (fallbackChapter) syllabusSubjectId = fallbackChapter.syllabusSubjectId;
  }
  if (!syllabusSubjectId) {
    return res.status(400).json({
      error:
        "Pick a subject (or a fallback chapter) before uploading. The subject scopes which chapters can be created or matched.",
    });
  }

  const result = await importParsedQuestions(parsed, {
    syllabusSubjectId,
    chapterId: p.data.chapterId,
    topicId: p.data.topicId,
    difficulty: parseDifficulty(p.data.difficulty),
    mode,
    createdById: req.user!.sub,
    filename: originalname,
    autoCreate,
  });
  res.json({
    batchId: result.batchId,
    mode,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
    parseCount: parsed.length,
    errors: result.errors,
  });
});

export default router;
