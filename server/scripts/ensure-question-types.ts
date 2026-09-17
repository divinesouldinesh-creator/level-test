/**
 * Ensures MCQ2 / NUMERIC question columns exist.
 * Usage: npx tsx scripts/ensure-question-types.ts
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
  CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'MCQ2', 'NUMERIC');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "type" "QuestionType" NOT NULL DEFAULT 'MCQ'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "correct_numeric" DOUBLE PRECISION`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "numeric_tolerance" DOUBLE PRECISION NOT NULL DEFAULT 0`
  );
  await prisma.$executeRawUnsafe(`ALTER TABLE "Question" ALTER COLUMN "option_a" SET DEFAULT ''`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Question" ALTER COLUMN "option_b" SET DEFAULT ''`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Question" ALTER COLUMN "option_c" SET DEFAULT ''`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Question" ALTER COLUMN "option_d" SET DEFAULT ''`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Question" ALTER COLUMN "correct_option" SET DEFAULT 0`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "StudentAnswer" ADD COLUMN IF NOT EXISTS "numeric_answer" DOUBLE PRECISION`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "DailyChallengeQuestion" ADD COLUMN IF NOT EXISTS "numeric_answer" DOUBLE PRECISION`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "MasterySessionQuestion" ADD COLUMN IF NOT EXISTS "numeric_answer" DOUBLE PRECISION`
  );

  const migrationName = "20260917073000_question_types";
  try {
    const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
    `;
    if (existing.length === 0) {
      const sqlPath = path.join(__dirname, "../prisma/migrations/20260917073000_question_types/migration.sql");
      const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
      const id = randomUUID();
      const now = new Date();
      await prisma.$executeRaw`
        INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
      `;
    }
  } catch {
    // _prisma_migrations may not exist in some environments
  }

  console.log("Question types (MCQ2, NUMERIC) ensured.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
