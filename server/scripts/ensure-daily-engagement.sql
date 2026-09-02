-- Ensure daily engagement tables exist (safe to re-run).
DO $$ BEGIN
  CREATE TYPE "XpReason" AS ENUM ('CHECK_IN', 'DAILY_CHALLENGE', 'DAILY_CHALLENGE_BONUS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DailyChallengeStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "StudentEngagement" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "xp_total" INTEGER NOT NULL DEFAULT 0,
    "check_in_streak" INTEGER NOT NULL DEFAULT 0,
    "best_check_in_streak" INTEGER NOT NULL DEFAULT 0,
    "practice_streak" INTEGER NOT NULL DEFAULT 0,
    "best_practice_streak" INTEGER NOT NULL DEFAULT 0,
    "last_check_in_day" TEXT,
    "last_practice_day" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentEngagement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "XpEvent" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "XpReason" NOT NULL,
    "day_key" TEXT NOT NULL,
    "ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DailyChallenge" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "day_key" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "status" "DailyChallengeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "focus_topic_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score" INTEGER,
    "max_score" INTEGER,
    "percentage" DOUBLE PRECISION,
    "xp_awarded" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DailyChallengeQuestion" (
    "id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "selected_option" INTEGER,
    "is_correct" BOOLEAN,
    CONSTRAINT "DailyChallengeQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudentEngagement_student_id_key" ON "StudentEngagement"("student_id");
CREATE INDEX IF NOT EXISTS "XpEvent_student_id_day_key_idx" ON "XpEvent"("student_id", "day_key");
CREATE INDEX IF NOT EXISTS "XpEvent_student_id_reason_day_key_idx" ON "XpEvent"("student_id", "reason", "day_key");
CREATE INDEX IF NOT EXISTS "DailyChallenge_student_id_day_key_idx" ON "DailyChallenge"("student_id", "day_key");
CREATE INDEX IF NOT EXISTS "DailyChallenge_subject_id_idx" ON "DailyChallenge"("subject_id");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyChallenge_student_id_day_key_key" ON "DailyChallenge"("student_id", "day_key");
CREATE INDEX IF NOT EXISTS "DailyChallengeQuestion_challenge_id_idx" ON "DailyChallengeQuestion"("challenge_id");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyChallengeQuestion_challenge_id_order_index_key" ON "DailyChallengeQuestion"("challenge_id", "order_index");

DO $$ BEGIN
  ALTER TABLE "StudentEngagement" ADD CONSTRAINT "StudentEngagement_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DailyChallenge" ADD CONSTRAINT "DailyChallenge_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "Level"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DailyChallengeQuestion" ADD CONSTRAINT "DailyChallengeQuestion_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DailyChallengeQuestion" ADD CONSTRAINT "DailyChallengeQuestion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
