/**
 * Creates daily engagement tables when migrate deploy can't reach the DB.
 * Usage: npx tsx scripts/ensure-daily-engagement.ts
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
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "XpReason" AS ENUM ('CHECK_IN', 'DAILY_CHALLENGE', 'DAILY_CHALLENGE_BONUS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "DailyChallengeStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "StudentEngagement" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "xp_total" INTEGER NOT NULL DEFAULT 0,
    "check_in_streak" INTEGER NOT NULL DEFAULT 0,
    "best_check_in_streak" INTEGER NOT NULL DEFAULT 0,
    "practice_streak" INTEGER NOT NULL DEFAULT 0,
    "best_practice_streak" INTEGER NOT NULL DEFAULT 0,
    "last_check_in_day" TEXT,
    "last_practice_day" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentEngagement_pkey" PRIMARY KEY ("id")
)`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "XpEvent" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "XpReason" NOT NULL,
    "day_key" TEXT NOT NULL,
    "ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
)`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "DailyChallenge" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "day_key" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "status" "DailyChallengeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "focus_topic_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score" INTEGER,
    "max_score" INTEGER,
    "percentage" DOUBLE PRECISION,
    "xp_awarded" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
)`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "DailyChallengeQuestion" (
    "id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "selected_option" INTEGER,
    "is_correct" BOOLEAN,
    CONSTRAINT "DailyChallengeQuestion_pkey" PRIMARY KEY ("id")
)`);

  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "StudentEngagement_student_id_key" ON "StudentEngagement"("student_id")`,
    `CREATE INDEX IF NOT EXISTS "XpEvent_student_id_day_key_idx" ON "XpEvent"("student_id", "day_key")`,
    `CREATE INDEX IF NOT EXISTS "XpEvent_student_id_reason_day_key_idx" ON "XpEvent"("student_id", "reason", "day_key")`,
    `CREATE INDEX IF NOT EXISTS "DailyChallenge_student_id_day_key_idx" ON "DailyChallenge"("student_id", "day_key")`,
    `CREATE INDEX IF NOT EXISTS "DailyChallenge_subject_id_idx" ON "DailyChallenge"("subject_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DailyChallenge_student_id_day_key_key" ON "DailyChallenge"("student_id", "day_key")`,
    `CREATE INDEX IF NOT EXISTS "DailyChallengeQuestion_challenge_id_idx" ON "DailyChallengeQuestion"("challenge_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DailyChallengeQuestion_challenge_id_order_index_key" ON "DailyChallengeQuestion"("challenge_id", "order_index")`,
  ];
  for (const sql of indexes) {
    await prisma.$executeRawUnsafe(sql);
  }

  const fks = [
    [`StudentEngagement_student_id_fkey`, `ALTER TABLE "StudentEngagement" ADD CONSTRAINT "StudentEngagement_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    [`XpEvent_student_id_fkey`, `ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    [`DailyChallenge_student_id_fkey`, `ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    [`DailyChallenge_subject_id_fkey`, `ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    [`DailyChallenge_level_id_fkey`, `ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "Level"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    [`DailyChallengeQuestion_challenge_id_fkey`, `ALTER TABLE "DailyChallengeQuestion" ADD CONSTRAINT "DailyChallengeQuestion_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
    [`DailyChallengeQuestion_question_id_fkey`, `ALTER TABLE "DailyChallengeQuestion" ADD CONSTRAINT "DailyChallengeQuestion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE`],
  ] as const;

  for (const [, sql] of fks) {
    await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ${sql};
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  }

  const migrationName = "20260902153000_student_daily_engagement";
  const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
  `;
  if (existing.length === 0) {
    const sqlPath = path.join(
      __dirname,
      "../prisma/migrations/20260902153000_student_daily_engagement/migration.sql"
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

  console.log("Daily engagement tables ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
