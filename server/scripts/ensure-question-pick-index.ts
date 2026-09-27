/**
 * Indexes for drawing a few questions from a chapter without scanning the whole bank.
 * Usage: npx tsx scripts/ensure-question-pick-index.ts
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
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Level_order_idx" ON "Level" ("order")`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Question_topic_id_level_id_idx" ON "Question" ("topic_id", "level_id")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "StudentAnswer_question_id_idx" ON "StudentAnswer" ("question_id")`
  );

  const migrationName = "20260927140000_question_pick_index";
  try {
    const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
    `;
    if (existing.length === 0) {
      const sqlPath = path.join(__dirname, "../prisma/migrations/20260927140000_question_pick_index/migration.sql");
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

  console.log("Question pick indexes ensured.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
