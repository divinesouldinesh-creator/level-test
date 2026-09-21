-- CreateEnum
CREATE TYPE "FeeChargeKind" AS ENUM ('MONTHLY', 'ANNUAL', 'ADMISSION', 'EXAM', 'OTHER', 'OPENING');

-- CreateEnum
CREATE TYPE "FeePaymentMode" AS ENUM ('CASH', 'UPI', 'BANK');

-- CreateTable
CREATE TABLE "FeeAccount" (
    "id" TEXT NOT NULL,
    "parent_name" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAccountMember" (
    "id" TEXT NOT NULL,
    "fee_account_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "uses_transport" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeAccountMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "academic_year" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "tuition_amount" INTEGER NOT NULL DEFAULT 0,
    "transport_amount" INTEGER NOT NULL DEFAULT 0,
    "annual_amount" INTEGER NOT NULL DEFAULT 0,
    "admission_amount" INTEGER NOT NULL DEFAULT 0,
    "exam_amount" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeCharge" (
    "id" TEXT NOT NULL,
    "fee_account_id" TEXT NOT NULL,
    "kind" "FeeChargeKind" NOT NULL,
    "period_key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "detail_json" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePayment" (
    "id" TEXT NOT NULL,
    "fee_account_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "mode" "FeePaymentMode" NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "paid_on" TEXT NOT NULL,
    "note" TEXT,
    "recorded_against_student_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeReceiptSeq" (
    "academic_year" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FeeReceiptSeq_pkey" PRIMARY KEY ("academic_year")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeAccountMember_student_id_key" ON "FeeAccountMember"("student_id");

-- CreateIndex
CREATE INDEX "FeeAccountMember_fee_account_id_idx" ON "FeeAccountMember"("fee_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_academic_year_class_id_key" ON "FeeStructure"("academic_year", "class_id");

-- CreateIndex
CREATE INDEX "FeeStructure_academic_year_idx" ON "FeeStructure"("academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "FeeCharge_fee_account_id_kind_period_key_key" ON "FeeCharge"("fee_account_id", "kind", "period_key");

-- CreateIndex
CREATE INDEX "FeeCharge_fee_account_id_idx" ON "FeeCharge"("fee_account_id");

-- CreateIndex
CREATE INDEX "FeeCharge_kind_period_key_idx" ON "FeeCharge"("kind", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "FeePayment_receipt_no_key" ON "FeePayment"("receipt_no");

-- CreateIndex
CREATE INDEX "FeePayment_fee_account_id_idx" ON "FeePayment"("fee_account_id");

-- CreateIndex
CREATE INDEX "FeePayment_paid_on_idx" ON "FeePayment"("paid_on");

-- AddForeignKey
ALTER TABLE "FeeAccountMember" ADD CONSTRAINT "FeeAccountMember_fee_account_id_fkey" FOREIGN KEY ("fee_account_id") REFERENCES "FeeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAccountMember" ADD CONSTRAINT "FeeAccountMember_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeCharge" ADD CONSTRAINT "FeeCharge_fee_account_id_fkey" FOREIGN KEY ("fee_account_id") REFERENCES "FeeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeCharge" ADD CONSTRAINT "FeeCharge_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_fee_account_id_fkey" FOREIGN KEY ("fee_account_id") REFERENCES "FeeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_recorded_against_student_id_fkey" FOREIGN KEY ("recorded_against_student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
