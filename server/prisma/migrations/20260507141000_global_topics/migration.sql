-- Make topics reusable across subjects and levels.
ALTER TABLE "Topic" DROP CONSTRAINT IF EXISTS "Topic_subject_id_fkey";
ALTER TABLE "Topic" DROP CONSTRAINT IF EXISTS "Topic_level_id_fkey";

DROP INDEX IF EXISTS "Topic_name_key";

ALTER TABLE "Topic" DROP COLUMN IF EXISTS "subject_id";
ALTER TABLE "Topic" DROP COLUMN IF EXISTS "level_id";

CREATE UNIQUE INDEX "Topic_name_key" ON "Topic"("name");
