-- Drop Model 2 (syllabus / chapter-based testing) tables.
-- Order: dependents first, then parents.

DROP TABLE IF EXISTS "SyllabusStudentAnswer";
DROP TABLE IF EXISTS "SyllabusTestAttempt";
DROP TABLE IF EXISTS "SyllabusTestQuestion";
DROP TABLE IF EXISTS "SyllabusTestChapter";
DROP TABLE IF EXISTS "SyllabusTest";
DROP TABLE IF EXISTS "SyllabusQuestion";
DROP TABLE IF EXISTS "ChapterTopicParticipation";
DROP TABLE IF EXISTS "SyllabusTopic";
DROP TABLE IF EXISTS "Chapter";
DROP TABLE IF EXISTS "SyllabusSubject";
DROP TABLE IF EXISTS "SyllabusQuestionImport";
