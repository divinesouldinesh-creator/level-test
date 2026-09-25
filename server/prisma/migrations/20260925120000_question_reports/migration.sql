-- Student reports on questions seen in a finished test.

DO $$ BEGIN
  CREATE TYPE "QuestionReportReason" AS ENUM ('WRONG_ANSWER', 'UNCLEAR', 'BAD_DIAGRAM', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "QuestionReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "QuestionReport" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "reason" "QuestionReportReason" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "QuestionReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuestionReport_question_id_student_id_test_id_key" ON "QuestionReport"("question_id", "student_id", "test_id");
CREATE INDEX IF NOT EXISTS "QuestionReport_status_created_at_idx" ON "QuestionReport"("status", "created_at");
CREATE INDEX IF NOT EXISTS "QuestionReport_question_id_status_idx" ON "QuestionReport"("question_id", "status");

DO $$ BEGIN
  ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_test_id_fkey"
    FOREIGN KEY ("test_id") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_resolved_by_id_fkey"
    FOREIGN KEY ("resolved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
