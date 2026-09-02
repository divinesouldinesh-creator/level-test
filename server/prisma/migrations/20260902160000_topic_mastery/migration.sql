-- AlterEnum
ALTER TYPE "XpReason" ADD VALUE IF NOT EXISTS 'TOPIC_PRACTICE';
ALTER TYPE "XpReason" ADD VALUE IF NOT EXISTS 'TOPIC_MASTERY';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TopicMasteryStatus" AS ENUM ('NEEDS_WORK', 'LEARNING', 'PRACTICING', 'REVIEW_DUE', 'MASTERED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MasterySessionKind" AS ENUM ('PRACTICE', 'RECHECK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MasterySessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE "TopicLesson" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicLesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TopicMastery" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "status" "TopicMasteryStatus" NOT NULL DEFAULT 'NEEDS_WORK',
    "learn_completed_at" TIMESTAMP(3),
    "last_practice_pct" DOUBLE PRECISION,
    "last_practice_at" TIMESTAMP(3),
    "last_recheck_pct" DOUBLE PRECISION,
    "last_recheck_at" TIMESTAMP(3),
    "mastered_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicMastery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MasterySession" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "topic_mastery_id" TEXT NOT NULL,
    "kind" "MasterySessionKind" NOT NULL,
    "status" "MasterySessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER,
    "max_score" INTEGER,
    "percentage" DOUBLE PRECISION,
    "xp_awarded" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "MasterySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MasterySessionQuestion" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "selected_option" INTEGER,
    "is_correct" BOOLEAN,

    CONSTRAINT "MasterySessionQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TopicLesson_topic_id_key" ON "TopicLesson"("topic_id");
CREATE INDEX "TopicMastery_student_id_status_idx" ON "TopicMastery"("student_id", "status");
CREATE INDEX "TopicMastery_topic_id_idx" ON "TopicMastery"("topic_id");
CREATE UNIQUE INDEX "TopicMastery_student_id_topic_id_level_id_key" ON "TopicMastery"("student_id", "topic_id", "level_id");
CREATE INDEX "MasterySession_student_id_status_idx" ON "MasterySession"("student_id", "status");
CREATE INDEX "MasterySession_topic_mastery_id_idx" ON "MasterySession"("topic_mastery_id");
CREATE INDEX "MasterySessionQuestion_session_id_idx" ON "MasterySessionQuestion"("session_id");
CREATE UNIQUE INDEX "MasterySessionQuestion_session_id_order_index_key" ON "MasterySessionQuestion"("session_id", "order_index");

ALTER TABLE "TopicLesson" ADD CONSTRAINT "TopicLesson_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "Level"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterySession" ADD CONSTRAINT "MasterySession_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterySession" ADD CONSTRAINT "MasterySession_topic_mastery_id_fkey" FOREIGN KEY ("topic_mastery_id") REFERENCES "TopicMastery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterySessionQuestion" ADD CONSTRAINT "MasterySessionQuestion_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "MasterySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterySessionQuestion" ADD CONSTRAINT "MasterySessionQuestion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
