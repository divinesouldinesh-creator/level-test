/**
 * One-shot: apply Office role + table when `prisma migrate deploy` cannot
 * reach DIRECT_URL (IPv6-only host). Uses DATABASE_URL (pooler).
 *
 * Usage: npx tsx prisma/ensure-office.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const MIGRATION_NAME = "20260905120000_office_role";
const prisma = new PrismaClient();

async function main() {
  console.log("Applying Office schema via DATABASE_URL…");

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE 'OFFICE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`);
  console.log("✓ Role.OFFICE");

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "Office" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);
`);
  console.log("✓ Office table");

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Office_user_id_key" ON "Office"("user_id");`
  );
  console.log("✓ Office unique index");

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "Office" ADD CONSTRAINT "Office_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`);
  console.log("✓ Office FK");

  const sqlPath = path.resolve(
    process.cwd(),
    "prisma",
    "migrations",
    MIGRATION_NAME,
    "migration.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  const existing = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1`,
    MIGRATION_NAME
  );
  if (existing.length === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      randomUUID(),
      checksum,
      MIGRATION_NAME
    );
    console.log(`✓ Recorded ${MIGRATION_NAME} in _prisma_migrations`);
  } else {
    console.log(`✓ Migration ${MIGRATION_NAME} already recorded`);
  }

  const rows = await prisma.$queryRawUnsafe<{ c: number }[]>(
    `SELECT COUNT(*)::int AS c FROM "Office"`
  );
  console.log(`Done. Office rows: ${rows[0]?.c ?? 0}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
