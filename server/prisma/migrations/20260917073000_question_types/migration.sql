-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'MCQ2', 'NUMERIC');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable Question
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "type" "QuestionType" NOT NULL DEFAULT 'MCQ';
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "correct_numeric" DOUBLE PRECISION;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "numeric_tolerance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Question" ALTER COLUMN "option_a" SET DEFAULT '';
ALTER TABLE "Question" ALTER COLUMN "option_b" SET DEFAULT '';
ALTER TABLE "Question" ALTER COLUMN "option_c" SET DEFAULT '';
ALTER TABLE "Question" ALTER COLUMN "option_d" SET DEFAULT '';
ALTER TABLE "Question" ALTER COLUMN "correct_option" SET DEFAULT 0;

-- AlterTable StudentAnswer
ALTER TABLE "StudentAnswer" ADD COLUMN IF NOT EXISTS "numeric_answer" DOUBLE PRECISION;

-- AlterTable DailyChallengeQuestion
ALTER TABLE "DailyChallengeQuestion" ADD COLUMN IF NOT EXISTS "numeric_answer" DOUBLE PRECISION;

-- AlterTable MasterySessionQuestion
ALTER TABLE "MasterySessionQuestion" ADD COLUMN IF NOT EXISTS "numeric_answer" DOUBLE PRECISION;
