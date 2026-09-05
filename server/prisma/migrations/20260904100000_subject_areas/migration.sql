-- CreateTable
CREATE TABLE "SubjectArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SubjectArea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubjectArea_name_key" ON "SubjectArea"("name");

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "area_id" TEXT;

CREATE INDEX IF NOT EXISTS "Subject_area_id_idx" ON "Subject"("area_id");

DO $$ BEGIN
  ALTER TABLE "Subject" ADD CONSTRAINT "Subject_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "SubjectArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed default areas
INSERT INTO "SubjectArea" ("id", "name", "code", "sort_order")
VALUES
  ('area-maths', 'Maths', 'MATHS', 0),
  ('area-english', 'English', 'ENG', 1)
ON CONFLICT ("name") DO NOTHING;
