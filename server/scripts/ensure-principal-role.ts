/**
 * Ensures the principal role and profile table.
 * Usage: npx tsx scripts/ensure-principal-role.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationName = "20261006120000_principal_role";

async function main() {
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE 'PRINCIPAL';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "Principal" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    CONSTRAINT "Principal_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Principal_user_id_key" ON "Principal"("user_id")`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "Principal" ADD CONSTRAINT "Principal_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$`);

  const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
  `;
  if (existing.length === 0) {
    const sqlPath = path.join(__dirname, `../prisma/migrations/${migrationName}/migration.sql`);
    const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
    `;
    console.log("Recorded migration:", migrationName);
  }
  console.log("Principal role ready");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
