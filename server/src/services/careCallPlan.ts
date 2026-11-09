import { CareCallYesNo, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { istDayKey, istDayUtcRange } from "./engagementCalendar.js";

const BUILTIN = [
  { code: "ENGLISH", label: "English practice" },
  { code: "PHONE", label: "Heavy phone / TV" },
] as const;

export type CareQuestion = { id: string; label: string; code: string | null };

let ready: Promise<void> | null = null;

export function monthKey(date = new Date()): string {
  return istDayKey(date).slice(0, 7);
}

export function nextMonthKey(month = monthKey()): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = istDayUtcRange(`${month}-01`);
  const end = istDayUtcRange(`${month}-${String(last).padStart(2, "0")}`);
  if (!start || !end) return null;
  return { start: start.start, end: end.end };
}

async function ensureTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CareCallQuestion" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareCallQuestion_pkey" PRIMARY KEY ("id")
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CareCallQuestion_code_key" ON "CareCallQuestion"("code")`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CareCallQuestion_label_key" ON "CareCallQuestion"("label")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CareCallMonthQuestion" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CareCallMonthQuestion_pkey" PRIMARY KEY ("id")
  )`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "CareCallMonthQuestion_month_question_id_key" ON "CareCallMonthQuestion"("month", "question_id")`
  );
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CareCallMonthQuestion_month_idx" ON "CareCallMonthQuestion"("month")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CareCallAnswer" (
    "id" TEXT NOT NULL,
    "care_call_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "value" "CareCallYesNo" NOT NULL,
    CONSTRAINT "CareCallAnswer_pkey" PRIMARY KEY ("id")
  )`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "CareCallAnswer_care_call_id_question_id_key" ON "CareCallAnswer"("care_call_id", "question_id")`
  );
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CareCallAnswer_question_id_idx" ON "CareCallAnswer"("question_id")`);
}

export function ensureCareCallQuestions(): Promise<void> {
  if (!ready) {
    ready = ensureTables()
      .then(() => seedBuiltinQuestions())
      .then(() => backfillLegacyAnswers())
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

async function seedBuiltinQuestions(): Promise<void> {
  for (const question of BUILTIN) {
    const existing = await prisma.careCallQuestion.findFirst({
      where: { OR: [{ code: question.code }, { label: question.label }] },
    });
    if (!existing) {
      await prisma.careCallQuestion.create({ data: question });
      continue;
    }
    if (existing.code !== question.code || existing.label !== question.label) {
      await prisma.careCallQuestion.update({
        where: { id: existing.id },
        data: { code: question.code, label: question.label },
      });
    }
  }
}

async function backfillLegacyAnswers(): Promise<void> {
  const english = await prisma.careCallQuestion.findUnique({ where: { code: "ENGLISH" } });
  const phone = await prisma.careCallQuestion.findUnique({ where: { code: "PHONE" } });
  if (!english || !phone) return;
  const calls = await prisma.careCall.findMany({
    where: { OR: [{ englishMirrorPractice: { not: null } }, { heavyPhoneTv: { not: null } }] },
    select: {
      id: true,
      englishMirrorPractice: true,
      heavyPhoneTv: true,
      answers: { select: { questionId: true } },
    },
  });
  const rows: { careCallId: string; questionId: string; value: CareCallYesNo }[] = [];
  for (const call of calls) {
    const have = new Set(call.answers.map((answer) => answer.questionId));
    if (call.englishMirrorPractice && !have.has(english.id)) {
      rows.push({ careCallId: call.id, questionId: english.id, value: call.englishMirrorPractice });
    }
    if (call.heavyPhoneTv && !have.has(phone.id)) {
      rows.push({ careCallId: call.id, questionId: phone.id, value: call.heavyPhoneTv });
    }
  }
  if (rows.length > 0) await prisma.careCallAnswer.createMany({ data: rows, skipDuplicates: true });
}

async function listOwn(month: string): Promise<CareQuestion[]> {
  const rows = await prisma.careCallMonthQuestion.findMany({
    where: { month },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { question: true },
  });
  return rows.map((row) => ({ id: row.question.id, label: row.question.label, code: row.question.code }));
}

/** Questions for a month. A month that was never edited uses the previous plan, then the two original questions. */
export async function questionsForMonth(month: string): Promise<CareQuestion[]> {
  await ensureCareCallQuestions();
  const own = await listOwn(month);
  if (own.length > 0) return own;
  const earlier = await prisma.careCallMonthQuestion.findFirst({
    where: { month: { lt: month } },
    orderBy: { month: "desc" },
    select: { month: true },
  });
  if (earlier) return listOwn(earlier.month);
  const builtins = await prisma.careCallQuestion.findMany({
    where: { code: { in: ["ENGLISH", "PHONE"] } },
  });
  return BUILTIN.flatMap((item) => {
    const found = builtins.find((question) => question.code === item.code);
    return found ? [{ id: found.id, label: found.label, code: found.code }] : [];
  });
}

export async function materializeMonth(month: string): Promise<CareQuestion[]> {
  const own = await listOwn(month);
  if (own.length > 0) return own;
  const questions = await questionsForMonth(month);
  if (questions.length === 0) return [];
  await prisma.careCallMonthQuestion.createMany({
    data: questions.map((question, index) => ({ month, questionId: question.id, sortOrder: index })),
    skipDuplicates: true,
  });
  return listOwn(month);
}

export async function monthHasCalls(month: string): Promise<boolean> {
  const bounds = monthBounds(month);
  if (!bounds) return false;
  const call = await prisma.careCall.findFirst({
    where: { calledAt: { gte: bounds.start, lt: bounds.end } },
    select: { id: true },
  });
  return Boolean(call);
}

export async function addQuestionToMonth(month: string, label: string): Promise<CareQuestion[]> {
  const name = label.trim();
  if (!name || name.length > 60) throw new Error("Enter a question name");
  await materializeMonth(month);
  const existing = await prisma.careCallQuestion.findFirst({
    where: { label: { equals: name, mode: "insensitive" } },
  });
  const question =
    existing ??
    (await prisma.careCallQuestion.create({
      data: { label: name },
    }));
  const linked = await prisma.careCallMonthQuestion.findUnique({
    where: { month_questionId: { month, questionId: question.id } },
  });
  if (linked) throw new Error("That question is already on this month");
  const last = await prisma.careCallMonthQuestion.findFirst({
    where: { month },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.careCallMonthQuestion.create({
    data: { month, questionId: question.id, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  return listOwn(month);
}

export async function removeQuestionFromMonth(month: string, questionId: string): Promise<CareQuestion[]> {
  if (await monthHasCalls(month)) {
    throw new Error("This month has saved calls, so a question cannot be removed");
  }
  await materializeMonth(month);
  const count = await prisma.careCallMonthQuestion.count({ where: { month } });
  if (count <= 1) throw new Error("Keep at least one question");
  await prisma.careCallMonthQuestion.deleteMany({ where: { month, questionId } });
  return listOwn(month);
}

export function legacyFields(
  questions: CareQuestion[],
  answers: { questionId: string; value: CareCallYesNo }[]
): { englishMirrorPractice: CareCallYesNo | null; heavyPhoneTv: CareCallYesNo | null } {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer.value]));
  const english = questions.find((question) => question.code === "ENGLISH");
  const phone = questions.find((question) => question.code === "PHONE");
  return {
    englishMirrorPractice: english ? byId.get(english.id) ?? null : null,
    heavyPhoneTv: phone ? byId.get(phone.id) ?? null : null,
  };
}

export function answerMapForCall(
  questions: CareQuestion[],
  call: {
    englishMirrorPractice: CareCallYesNo | null;
    heavyPhoneTv: CareCallYesNo | null;
    answers: { questionId: string; value: CareCallYesNo }[];
  } | null
): Record<string, CareCallYesNo | null> {
  const stored = new Map(call?.answers.map((answer) => [answer.questionId, answer.value]) ?? []);
  const map: Record<string, CareCallYesNo | null> = {};
  for (const question of questions) {
    if (stored.has(question.id)) map[question.id] = stored.get(question.id) ?? null;
    else if (question.code === "ENGLISH") map[question.id] = call?.englishMirrorPractice ?? null;
    else if (question.code === "PHONE") map[question.id] = call?.heavyPhoneTv ?? null;
    else map[question.id] = null;
  }
  return map;
}

export function callHasAnswer(map: Record<string, CareCallYesNo | null>): boolean {
  return Object.values(map).some((value) => value != null);
}

export async function careCallSubmissions(month: string): Promise<{
  month: string;
  rows: {
    sectionId: string;
    className: string;
    sectionName: string;
    studentCount: number;
    answeredCount: number;
    submitted: boolean;
    teacherName: string | null;
    savedAt: string | null;
  }[];
}> {
  if (!monthBounds(month)) throw new Error("month must be YYYY-MM");
  await ensureCareCallQuestions();
  const bounds = monthBounds(month)!;
  const questions = await questionsForMonth(month);
  const sections = await prisma.section.findMany({
    orderBy: [{ schoolClass: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      schoolClass: { select: { name: true } },
      students: { select: { id: true } },
    },
  });
  const studentIds = sections.flatMap((section) => section.students.map((student) => student.id));
  const calls =
    studentIds.length === 0
      ? []
      : await prisma.careCall.findMany({
          where: { studentId: { in: studentIds }, calledAt: { gte: bounds.start, lt: bounds.end } },
          orderBy: { calledAt: "desc" },
          include: {
            ...careCallAnswerInclude,
            recordedBy: { select: { email: true, teacher: { select: { fullName: true } } } },
          },
        });
  const latestByStudent = new Map<string, (typeof calls)[number]>();
  for (const call of calls) {
    if (latestByStudent.has(call.studentId)) continue;
    if (!callHasAnswer(answerMapForCall(questions, call))) continue;
    latestByStudent.set(call.studentId, call);
  }
  const rows = sections
    .filter((section) => section.students.length > 0)
    .map((section) => {
      const saved = section.students
        .map((student) => latestByStudent.get(student.id))
        .filter((call): call is (typeof calls)[number] => Boolean(call))
        .sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime());
      const latest = saved[0];
      return {
        sectionId: section.id,
        className: section.schoolClass.name,
        sectionName: section.name,
        studentCount: section.students.length,
        answeredCount: saved.length,
        submitted: saved.length > 0,
        teacherName: latest?.recordedBy?.teacher?.fullName ?? latest?.recordedBy?.email ?? null,
        savedAt: latest ? latest.calledAt.toISOString() : null,
      };
    })
    .sort((a, b) => Number(a.submitted) - Number(b.submitted) || a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName));
  return { month, rows };
}

export async function describeMonth(month: string): Promise<{
  month: string;
  locked: boolean;
  questions: CareQuestion[];
}> {
  const [questions, locked] = await Promise.all([questionsForMonth(month), monthHasCalls(month)]);
  return { month, locked, questions };
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export type AnswerWrite = { questionId: string; value: CareCallYesNo };

export async function createCareCall(input: {
  studentId: string;
  recordedById: string | null;
  questions: CareQuestion[];
  answers: AnswerWrite[];
  calledAt?: Date;
}): Promise<void> {
  const allowed = new Set(input.questions.map((question) => question.id));
  const answers = input.answers.filter((answer) => allowed.has(answer.questionId));
  if (answers.length === 0) return;
  const legacy = legacyFields(input.questions, answers);
  await prisma.careCall.create({
    data: {
      studentId: input.studentId,
      calledAt: input.calledAt ?? new Date(),
      recordedById: input.recordedById,
      englishMirrorPractice: legacy.englishMirrorPractice,
      heavyPhoneTv: legacy.heavyPhoneTv,
      answers: { create: answers.map((answer) => ({ questionId: answer.questionId, value: answer.value })) },
    },
  });
}

export const careCallAnswerInclude = {
  answers: { select: { questionId: true, value: true } },
} satisfies Prisma.CareCallInclude;
