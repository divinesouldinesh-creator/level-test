/**
 * Ensures classroom assessment tables + English Speaking branch (oral placement levels).
 * Usage: npx tsx scripts/ensure-classroom-assessments.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPEAKING_SUBJECT_ID = "seed-subject-speaking";
const SPEAKING_LEVELS = [
  { id: "seed-speaking-level-0", order: 0, name: "Level 0: Start Speaking" },
  { id: "seed-speaking-level-1", order: 1, name: "Level 1: Confident Speaking" },
  { id: "seed-speaking-level-2", order: 2, name: "Level 2: English in Class" },
  { id: "seed-speaking-level-3", order: 3, name: "Level 3: Connected Speaking" },
  { id: "seed-speaking-level-4", order: 4, name: "Level 4: Expressive Speaking" },
  { id: "seed-speaking-level-5", order: 5, name: "Level 5: Spontaneous Speaking" },
];

async function ensureTables() {
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "ClassroomAssessmentKind" AS ENUM ('MARKS', 'ORAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "ClassroomAssessmentSession" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "kind" "ClassroomAssessmentKind" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tested_level_id" TEXT,
    "scope_key" TEXT NOT NULL,
    "notes" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassroomAssessmentSession_pkey" PRIMARY KEY ("id")
)`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "ClassroomAssessmentEntry" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER,
    "max_score" INTEGER,
    "percentage" DOUBLE PRECISION,
    "judged_level_id" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassroomAssessmentEntry_pkey" PRIMARY KEY ("id")
)`);

  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomAssessmentSession_scope_unique" ON "ClassroomAssessmentSession"("class_id", "section_id", "subject_id", "kind", "date", "scope_key")`,
    `CREATE INDEX IF NOT EXISTS "ClassroomAssessmentSession_date_idx" ON "ClassroomAssessmentSession"("date")`,
    `CREATE INDEX IF NOT EXISTS "ClassroomAssessmentSession_class_id_section_id_idx" ON "ClassroomAssessmentSession"("class_id", "section_id")`,
    `CREATE INDEX IF NOT EXISTS "ClassroomAssessmentSession_subject_id_kind_idx" ON "ClassroomAssessmentSession"("subject_id", "kind")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomAssessmentEntry_session_id_student_id_key" ON "ClassroomAssessmentEntry"("session_id", "student_id")`,
    `CREATE INDEX IF NOT EXISTS "ClassroomAssessmentEntry_student_id_idx" ON "ClassroomAssessmentEntry"("student_id")`,
    `CREATE INDEX IF NOT EXISTS "ClassroomAssessmentEntry_judged_level_id_idx" ON "ClassroomAssessmentEntry"("judged_level_id")`,
  ];
  for (const sql of indexes) {
    await prisma.$executeRawUnsafe(sql);
  }

  const fks = [
    `ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_tested_level_id_fkey" FOREIGN KEY ("tested_level_id") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `ALTER TABLE "ClassroomAssessmentEntry" ADD CONSTRAINT "ClassroomAssessmentEntry_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassroomAssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "ClassroomAssessmentEntry" ADD CONSTRAINT "ClassroomAssessmentEntry_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "ClassroomAssessmentEntry" ADD CONSTRAINT "ClassroomAssessmentEntry_judged_level_id_fkey" FOREIGN KEY ("judged_level_id") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  ];
  for (const sql of fks) {
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ${sql}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  }

  const migrationName = "20260915120000_classroom_assessments";
  const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
  `;
  if (existing.length === 0) {
    const sqlPath = path.join(
      __dirname,
      "../prisma/migrations/20260915120000_classroom_assessments/migration.sql"
    );
    const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
    `;
    console.log("Recorded migration:", migrationName);
  }
}

async function ensureSpeakingBranch() {
  const english = await prisma.subjectArea.upsert({
    where: { name: "English" },
    create: { id: "area-english", name: "English", code: "ENG", sortOrder: 1 },
    update: { code: "ENG", sortOrder: 1 },
  });

  const byId = await prisma.subject.findUnique({ where: { id: SPEAKING_SUBJECT_ID } });
  const byName =
    byId ??
    (await prisma.subject.findFirst({
      where: { name: "Speaking", areaId: english.id },
    }));

  const speaking = byName
    ? await prisma.subject.update({
        where: { id: byName.id },
        data: { name: "Speaking", code: "SPEAK", areaId: english.id },
      })
    : await prisma.subject.create({
        data: {
          id: SPEAKING_SUBJECT_ID,
          name: "Speaking",
          code: "SPEAK",
          areaId: english.id,
        },
      });

  for (const lvl of SPEAKING_LEVELS) {
    const existing =
      (await prisma.level.findUnique({ where: { id: lvl.id } })) ??
      (await prisma.level.findFirst({
        where: { subjectId: speaking.id, order: lvl.order },
      }));
    const level = existing
      ? await prisma.level.update({
          where: { id: existing.id },
          data: { name: lvl.name, order: lvl.order, subjectId: speaking.id },
        })
      : await prisma.level.create({
          data: {
            id: lvl.id,
            subjectId: speaking.id,
            name: lvl.name,
            order: lvl.order,
          },
        });
    await prisma.levelTestConfig.upsert({
      where: { levelId: level.id },
      update: {},
      create: { levelId: level.id, questionCount: 8 },
    });
  }

  const classes = await prisma.schoolClass.findMany({ select: { id: true, name: true } });
  for (const c of classes) {
    await prisma.classSubject.upsert({
      where: { classId_subjectId: { classId: c.id, subjectId: speaking.id } },
      update: {},
      create: { classId: c.id, subjectId: speaking.id },
    });
  }

  console.log(
    "Speaking branch ready:",
    speaking.id,
    "levels:",
    SPEAKING_LEVELS.length,
    "classes linked:",
    classes.length
  );
}

async function main() {
  await ensureTables();
  await ensureSpeakingBranch();
  console.log("Classroom assessments + Speaking branch ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
