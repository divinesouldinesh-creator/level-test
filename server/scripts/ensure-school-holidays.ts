/**
 * Ensures school holiday settings tables when migrate deploy can't reach the DB.
 * Usage: npx tsx scripts/ensure-school-holidays.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_NAME = "20260918140000_school_holidays";

async function recordMigration(migrationName: string) {
  const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
  `;
  if (existing.length > 0) return;
  const sqlPath = path.join(__dirname, `../prisma/migrations/${migrationName}/migration.sql`);
  if (!fs.existsSync(sqlPath)) return;
  const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
  const id = randomUUID();
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
  `;
  console.log("Recorded migration:", migrationName);
}

async function ensureTables() {
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "SaturdayHolidayRule" AS ENUM ('NONE', 'SECOND', 'ALL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "SchoolHolidayKind" AS ENUM ('EXTRA', 'WORKING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "SchoolHolidaySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sundays_off" BOOLEAN NOT NULL DEFAULT true,
    "saturday_rule" "SaturdayHolidayRule" NOT NULL DEFAULT 'SECOND',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolHolidaySettings_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "SchoolHolidayException" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "SchoolHolidayKind" NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolHolidayException_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "SchoolHolidayException_date_key" ON "SchoolHolidayException"("date")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SchoolHolidayException_date_idx" ON "SchoolHolidayException"("date")`
  );
  await prisma.$executeRawUnsafe(`
INSERT INTO "SchoolHolidaySettings" ("id", "sundays_off", "saturday_rule", "updated_at")
VALUES ('default', true, 'SECOND', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING`);
}

async function main() {
  await ensureTables();
  await recordMigration(MIGRATION_NAME);
  const settings = await prisma.$queryRaw<{ id: string; sundays_off: boolean; saturday_rule: string }[]>`
    SELECT id, sundays_off, saturday_rule FROM "SchoolHolidaySettings"
  `;
  console.log("School holidays ready:", settings);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
