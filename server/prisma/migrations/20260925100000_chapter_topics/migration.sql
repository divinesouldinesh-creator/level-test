-- Optional topics inside a book chapter. Questions with no topic stay on the chapter.

CREATE TABLE IF NOT EXISTS "ChapterTopic" (
    "id" TEXT NOT NULL,
    "subject_chapter_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ChapterTopic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChapterTopic_subject_chapter_id_name_key" ON "ChapterTopic"("subject_chapter_id", "name");
CREATE INDEX IF NOT EXISTS "ChapterTopic_subject_chapter_id_idx" ON "ChapterTopic"("subject_chapter_id");

DO $$ BEGIN
  ALTER TABLE "ChapterTopic" ADD CONSTRAINT "ChapterTopic_subject_chapter_id_fkey"
    FOREIGN KEY ("subject_chapter_id") REFERENCES "SubjectChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "chapter_topic_id" TEXT;
CREATE INDEX IF NOT EXISTS "Question_chapter_topic_id_idx" ON "Question"("chapter_topic_id");

DO $$ BEGIN
  ALTER TABLE "Question" ADD CONSTRAINT "Question_chapter_topic_id_fkey"
    FOREIGN KEY ("chapter_topic_id") REFERENCES "ChapterTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Test" ADD COLUMN IF NOT EXISTS "selected_chapter_topic_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
