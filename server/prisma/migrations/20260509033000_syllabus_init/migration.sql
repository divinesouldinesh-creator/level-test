-- =====================================================================
-- Syllabus (Model 2) — fully isolated tables for chapter-based, free
-- difficulty practice. Touches no existing Model 1 tables.
-- =====================================================================

-- Subjects scoped to one class (e.g. "Physics — Class 11")
CREATE TABLE "SyllabusSubject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "school_class_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyllabusSubject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyllabusSubject_school_class_id_name_key"
    ON "SyllabusSubject"("school_class_id", "name");
CREATE INDEX "SyllabusSubject_school_class_id_idx"
    ON "SyllabusSubject"("school_class_id");

ALTER TABLE "SyllabusSubject"
    ADD CONSTRAINT "SyllabusSubject_school_class_id_fkey"
    FOREIGN KEY ("school_class_id") REFERENCES "SchoolClass"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Chapters belong to one syllabus subject
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "syllabus_subject_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Chapter_syllabus_subject_id_name_key"
    ON "Chapter"("syllabus_subject_id", "name");
CREATE INDEX "Chapter_syllabus_subject_id_idx"
    ON "Chapter"("syllabus_subject_id");

ALTER TABLE "Chapter"
    ADD CONSTRAINT "Chapter_syllabus_subject_id_fkey"
    FOREIGN KEY ("syllabus_subject_id") REFERENCES "SyllabusSubject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Topics for syllabus side (separate pool from Model 1 Topic)
CREATE TABLE "SyllabusTopic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SyllabusTopic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyllabusTopic_name_key" ON "SyllabusTopic"("name");

-- Topic weightage per chapter
CREATE TABLE "ChapterTopicParticipation" (
    "chapter_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "weight_pct" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChapterTopicParticipation_pkey" PRIMARY KEY ("chapter_id","topic_id")
);

CREATE INDEX "ChapterTopicParticipation_chapter_id_idx"
    ON "ChapterTopicParticipation"("chapter_id");

ALTER TABLE "ChapterTopicParticipation"
    ADD CONSTRAINT "ChapterTopicParticipation_chapter_id_fkey"
    FOREIGN KEY ("chapter_id") REFERENCES "Chapter"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChapterTopicParticipation"
    ADD CONSTRAINT "ChapterTopicParticipation_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "SyllabusTopic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Syllabus question pool (separate from Model 1 Question)
CREATE TABLE "SyllabusQuestion" (
    "id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "stem" TEXT NOT NULL,
    "option_a" TEXT NOT NULL,
    "option_b" TEXT NOT NULL,
    "option_c" TEXT NOT NULL,
    "option_d" TEXT NOT NULL,
    "correct_option" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyllabusQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyllabusQuestion_content_hash_key"
    ON "SyllabusQuestion"("content_hash");
CREATE INDEX "SyllabusQuestion_chapter_id_difficulty_idx"
    ON "SyllabusQuestion"("chapter_id", "difficulty");
CREATE INDEX "SyllabusQuestion_chapter_id_topic_id_difficulty_idx"
    ON "SyllabusQuestion"("chapter_id", "topic_id", "difficulty");

ALTER TABLE "SyllabusQuestion"
    ADD CONSTRAINT "SyllabusQuestion_chapter_id_fkey"
    FOREIGN KEY ("chapter_id") REFERENCES "Chapter"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyllabusQuestion"
    ADD CONSTRAINT "SyllabusQuestion_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "SyllabusTopic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyllabusQuestion"
    ADD CONSTRAINT "SyllabusQuestion_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Syllabus tests (parallel to Test for Model 1)
CREATE TABLE "SyllabusTest" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "syllabus_subject_id" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "question_count" INTEGER NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "SyllabusTest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyllabusTest_student_id_syllabus_subject_id_idx"
    ON "SyllabusTest"("student_id", "syllabus_subject_id");

ALTER TABLE "SyllabusTest"
    ADD CONSTRAINT "SyllabusTest_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyllabusTest"
    ADD CONSTRAINT "SyllabusTest_syllabus_subject_id_fkey"
    FOREIGN KEY ("syllabus_subject_id") REFERENCES "SyllabusSubject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Which chapters this test draws from (multi-select supported)
CREATE TABLE "SyllabusTestChapter" (
    "test_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,

    CONSTRAINT "SyllabusTestChapter_pkey" PRIMARY KEY ("test_id","chapter_id")
);

CREATE INDEX "SyllabusTestChapter_test_id_idx"
    ON "SyllabusTestChapter"("test_id");

ALTER TABLE "SyllabusTestChapter"
    ADD CONSTRAINT "SyllabusTestChapter_test_id_fkey"
    FOREIGN KEY ("test_id") REFERENCES "SyllabusTest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyllabusTestChapter"
    ADD CONSTRAINT "SyllabusTestChapter_chapter_id_fkey"
    FOREIGN KEY ("chapter_id") REFERENCES "Chapter"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Test questions linking SyllabusTest <-> SyllabusQuestion
CREATE TABLE "SyllabusTestQuestion" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "syllabus_question_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "SyllabusTestQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyllabusTestQuestion_test_id_order_index_key"
    ON "SyllabusTestQuestion"("test_id", "order_index");
CREATE UNIQUE INDEX "SyllabusTestQuestion_test_id_syllabus_question_id_key"
    ON "SyllabusTestQuestion"("test_id", "syllabus_question_id");
CREATE INDEX "SyllabusTestQuestion_test_id_idx"
    ON "SyllabusTestQuestion"("test_id");

ALTER TABLE "SyllabusTestQuestion"
    ADD CONSTRAINT "SyllabusTestQuestion_test_id_fkey"
    FOREIGN KEY ("test_id") REFERENCES "SyllabusTest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyllabusTestQuestion"
    ADD CONSTRAINT "SyllabusTestQuestion_syllabus_question_id_fkey"
    FOREIGN KEY ("syllabus_question_id") REFERENCES "SyllabusQuestion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- One attempt per test (mirrors Model 1's TestAttempt; no progression band)
CREATE TABLE "SyllabusTestAttempt" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyllabusTestAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyllabusTestAttempt_test_id_key"
    ON "SyllabusTestAttempt"("test_id");

ALTER TABLE "SyllabusTestAttempt"
    ADD CONSTRAINT "SyllabusTestAttempt_test_id_fkey"
    FOREIGN KEY ("test_id") REFERENCES "SyllabusTest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-question saved answers
CREATE TABLE "SyllabusStudentAnswer" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "syllabus_question_id" TEXT NOT NULL,
    "selected_option" INTEGER,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "SyllabusStudentAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyllabusStudentAnswer_attempt_id_syllabus_question_id_key"
    ON "SyllabusStudentAnswer"("attempt_id", "syllabus_question_id");

ALTER TABLE "SyllabusStudentAnswer"
    ADD CONSTRAINT "SyllabusStudentAnswer_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "SyllabusTestAttempt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyllabusStudentAnswer"
    ADD CONSTRAINT "SyllabusStudentAnswer_syllabus_question_id_fkey"
    FOREIGN KEY ("syllabus_question_id") REFERENCES "SyllabusQuestion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Audit log for syllabus question imports
CREATE TABLE "SyllabusQuestionImport" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_duplicates" INTEGER NOT NULL DEFAULT 0,
    "errors_json" TEXT,

    CONSTRAINT "SyllabusQuestionImport_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SyllabusQuestionImport"
    ADD CONSTRAINT "SyllabusQuestionImport_uploaded_by_id_fkey"
    FOREIGN KEY ("uploaded_by_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
