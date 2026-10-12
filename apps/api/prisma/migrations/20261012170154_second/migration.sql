/*
  Warnings:

  - A unique constraint covering the columns `[transaction_id]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "property_type" ADD VALUE 'GARDEN_VILLA';

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "featured_until" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "transaction_id" UUID;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "agency_id" UUID,
ADD COLUMN     "package_type" "subscription_package",
ADD COLUMN     "property_id" UUID;

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_codes_phone_number_created_at_idx" ON "otp_codes"("phone_number", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_transaction_id_key" ON "subscriptions"("transaction_id");

-- CreateIndex
CREATE INDEX "transactions_agency_id_idx" ON "transactions"("agency_id");

-- CreateIndex
CREATE INDEX "transactions_property_id_idx" ON "transactions"("property_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
