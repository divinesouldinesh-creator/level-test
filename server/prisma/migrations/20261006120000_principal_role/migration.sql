-- AlterEnum
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE 'PRINCIPAL';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Principal" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,

    CONSTRAINT "Principal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Principal_user_id_key" ON "Principal"("user_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Principal" ADD CONSTRAINT "Principal_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
