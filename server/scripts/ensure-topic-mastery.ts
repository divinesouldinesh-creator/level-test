/**
 * Ensures topic mastery tables exist.
 * Usage: npx tsx scripts/ensure-topic-mastery.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TYPE "XpReason" ADD VALUE IF NOT EXISTS 'TOPIC_PRACTICE'`);
  await prisma.$executeRawUnsafe(`ALTER TYPE "XpReason" ADD VALUE IF NOT EXISTS 'TOPIC_MASTERY'`);

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "TopicMasteryStatus" AS ENUM ('NEEDS_WORK', 'LEARNING', 'PRACTICING', 'REVIEW_DUE', 'MASTERED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "MasterySessionKind" AS ENUM ('PRACTICE', 'RECHECK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "MasterySessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "TopicLesson" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicLesson_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "TopicMastery" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "status" "TopicMasteryStatus" NOT NULL DEFAULT 'NEEDS_WORK',
    "learn_completed_at" TIMESTAMP(3),
    "last_practice_pct" DOUBLE PRECISION,
    "last_practice_at" TIMESTAMP(3),
    "last_recheck_pct" DOUBLE PRECISION,
    "last_recheck_at" TIMESTAMP(3),
    "mastered_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicMastery_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "MasterySession" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "topic_mastery_id" TEXT NOT NULL,
    "kind" "MasterySessionKind" NOT NULL,
    "status" "MasterySessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER,
    "max_score" INTEGER,
    "percentage" DOUBLE PRECISION,
    "xp_awarded" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "MasterySession_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "MasterySessionQuestion" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "selected_option" INTEGER,
    "numeric_answer" DOUBLE PRECISION,
    "is_correct" BOOLEAN,
    CONSTRAINT "MasterySessionQuestion_pkey" PRIMARY KEY ("id")
)`);

  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "TopicLesson_topic_id_key" ON "TopicLesson"("topic_id")`,
    `CREATE INDEX IF NOT EXISTS "TopicMastery_student_id_status_idx" ON "TopicMastery"("student_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "TopicMastery_topic_id_idx" ON "TopicMastery"("topic_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "TopicMastery_student_id_topic_id_level_id_key" ON "TopicMastery"("student_id", "topic_id", "level_id")`,
    `CREATE INDEX IF NOT EXISTS "MasterySession_student_id_status_idx" ON "MasterySession"("student_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "MasterySession_topic_mastery_id_idx" ON "MasterySession"("topic_mastery_id")`,
    `CREATE INDEX IF NOT EXISTS "MasterySessionQuestion_session_id_idx" ON "MasterySessionQuestion"("session_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "MasterySessionQuestion_session_id_order_index_key" ON "MasterySessionQuestion"("session_id", "order_index")`,
  ];
  for (const sql of indexes) await prisma.$executeRawUnsafe(sql);

  const fks = [
    `ALTER TABLE "TopicLesson" ADD CONSTRAINT "TopicLesson_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "Level"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "MasterySession" ADD CONSTRAINT "MasterySession_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "MasterySession" ADD CONSTRAINT "MasterySession_topic_mastery_id_fkey" FOREIGN KEY ("topic_mastery_id") REFERENCES "TopicMastery"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "MasterySessionQuestion" ADD CONSTRAINT "MasterySessionQuestion_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "MasterySession"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "MasterySessionQuestion" ADD CONSTRAINT "MasterySessionQuestion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  ];
  for (const sql of fks) {
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ${sql}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  }

  const migrationName = "20260902160000_topic_mastery";
  const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
  `;
  if (existing.length === 0) {
    const sqlPath = path.join(__dirname, "../prisma/migrations/20260902160000_topic_mastery/migration.sql");
    const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
    `;
    console.log("Recorded migration:", migrationName);
  }

  console.log("Topic mastery tables ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
