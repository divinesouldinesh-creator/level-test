-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SubjectTestMode" AS ENUM ('LEVEL', 'CHAPTER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable Subject
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "test_mode" "SubjectTestMode" NOT NULL DEFAULT 'LEVEL';
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "chapter_test_question_count" INTEGER NOT NULL DEFAULT 10;

-- CreateTable SubjectChapter
CREATE TABLE IF NOT EXISTS "SubjectChapter" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SubjectChapter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubjectChapter_subject_id_topic_id_key" ON "SubjectChapter"("subject_id", "topic_id");
CREATE INDEX IF NOT EXISTS "SubjectChapter_subject_id_idx" ON "SubjectChapter"("subject_id");

DO $$ BEGIN
  ALTER TABLE "SubjectChapter" ADD CONSTRAINT "SubjectChapter_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SubjectChapter" ADD CONSTRAINT "SubjectChapter_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Chapter-mode questions and tests do not belong to a level.
ALTER TABLE "Question" ALTER COLUMN "level_id" DROP NOT NULL;
ALTER TABLE "Test" ALTER COLUMN "level_id" DROP NOT NULL;

ALTER TABLE "Test" ADD COLUMN IF NOT EXISTS "selected_topic_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
