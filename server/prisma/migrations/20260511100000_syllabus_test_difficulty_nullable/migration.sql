-- Student syllabus practice tests no longer store a single difficulty; mixed pool uses NULL.
ALTER TABLE "SyllabusTest" ALTER COLUMN "difficulty" DROP NOT NULL;
