CREATE TABLE IF NOT EXISTS "CareCallQuestion" (
  "id" TEXT NOT NULL,
  "code" TEXT,
  "label" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareCallQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CareCallQuestion_code_key" ON "CareCallQuestion"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "CareCallQuestion_label_key" ON "CareCallQuestion"("label");

CREATE TABLE IF NOT EXISTS "CareCallMonthQuestion" (
  "id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CareCallMonthQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CareCallMonthQuestion_month_question_id_key" ON "CareCallMonthQuestion"("month", "question_id");
CREATE INDEX IF NOT EXISTS "CareCallMonthQuestion_month_idx" ON "CareCallMonthQuestion"("month");

CREATE TABLE IF NOT EXISTS "CareCallAnswer" (
  "id" TEXT NOT NULL,
  "care_call_id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "value" "CareCallYesNo" NOT NULL,
  CONSTRAINT "CareCallAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CareCallAnswer_care_call_id_question_id_key" ON "CareCallAnswer"("care_call_id", "question_id");
CREATE INDEX IF NOT EXISTS "CareCallAnswer_question_id_idx" ON "CareCallAnswer"("question_id");

DO $$ BEGIN
  ALTER TABLE "CareCallMonthQuestion" ADD CONSTRAINT "CareCallMonthQuestion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "CareCallQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CareCallAnswer" ADD CONSTRAINT "CareCallAnswer_care_call_id_fkey" FOREIGN KEY ("care_call_id") REFERENCES "CareCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CareCallAnswer" ADD CONSTRAINT "CareCallAnswer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "CareCallQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
