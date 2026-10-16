/*
  The unit of a property, and app feedback.

  - properties.unit_type: an optional sub-type of the property type (a duplex or a courtyard house within
    HOUSE_HAWILI, a studio within APARTMENT…). Nullable: every existing listing simply has none. Which unit
    belongs to which type is the application's rule (PROPERTY_UNITS in @bongah/shared-types).
  - feedback: what signed-in users send from the Account tab's "نظرات و پیشنهادات".
*/

-- CreateEnum
CREATE TYPE "property_unit" AS ENUM ('HAWILI', 'DUPLEX', 'VILLA_HOUSE', 'TOWNHOUSE', 'FLAT', 'STUDIO', 'PENTHOUSE', 'SHOP', 'OFFICE', 'SHOWROOM', 'RESIDENTIAL_PLOT', 'COMMERCIAL_PLOT', 'FARMLAND', 'GARDEN', 'VILLA', 'GARAGE', 'WAREHOUSE', 'OTHER_UNIT');

-- CreateEnum
CREATE TYPE "feedback_category" AS ENUM ('SUGGESTION', 'PROBLEM', 'PRAISE', 'OTHER');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "unit_type" "property_unit";

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "feedback_category" NOT NULL,
    "message" TEXT NOT NULL,
    "app_version" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_user_id_created_at_idx" ON "feedback"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "feedback_created_at_idx" ON "feedback"("created_at");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
