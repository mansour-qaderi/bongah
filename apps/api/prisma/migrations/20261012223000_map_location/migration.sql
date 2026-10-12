/*
  Map location monetisation.

  - Exact map pins (lat/lng) become optional on properties and agencies: placing one needs an
    active agency subscription or a prepaid map location token.
  - properties.neighborhood: free-text neighbourhood for listings without a pin.
  - map_location_tokens: prepaid, single-use rights to pin one listing.
  - MAP_LOCATION joins the payment purposes.

  Existing rows keep the coordinates they already have; nothing is rewritten.
*/

-- AlterEnum
ALTER TYPE "transaction_purpose" ADD VALUE 'MAP_LOCATION';

-- CreateEnum
CREATE TYPE "map_location_token_source" AS ENUM ('PURCHASE', 'REFERRAL', 'ADMIN_GRANT');

-- AlterTable
ALTER TABLE "agencies" ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "lng" DROP NOT NULL;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "neighborhood" TEXT,
ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "lng" DROP NOT NULL;

-- CreateTable
CREATE TABLE "map_location_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "map_location_token_source" NOT NULL,
    "transaction_id" UUID,
    "property_id" UUID,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_location_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "map_location_tokens_transaction_id_key" ON "map_location_tokens"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "map_location_tokens_property_id_key" ON "map_location_tokens"("property_id");

-- CreateIndex
CREATE INDEX "map_location_tokens_user_id_consumed_at_idx" ON "map_location_tokens"("user_id", "consumed_at");

-- AddForeignKey
ALTER TABLE "map_location_tokens" ADD CONSTRAINT "map_location_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_location_tokens" ADD CONSTRAINT "map_location_tokens_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_location_tokens" ADD CONSTRAINT "map_location_tokens_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma cannot express, enforced by the database so no code path can break them.
-- (Prisma ignores CHECK constraints when it compares the database to the schema.)

-- A pin is a pair: both coordinates or neither.
ALTER TABLE "properties" ADD CONSTRAINT "properties_lat_lng_together" CHECK (("lat" IS NULL) = ("lng" IS NULL));
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_lat_lng_together" CHECK (("lat" IS NULL) = ("lng" IS NULL));

-- A token is either unspent (no listing) or spent on exactly one listing, and the two fields move together.
ALTER TABLE "map_location_tokens" ADD CONSTRAINT "map_location_tokens_spent_together" CHECK (("consumed_at" IS NULL) = ("property_id" IS NULL));

-- A purchased token always points at the payment that bought it; the other sources never do.
ALTER TABLE "map_location_tokens" ADD CONSTRAINT "map_location_tokens_purchase_has_payment" CHECK (("source" = 'PURCHASE') = ("transaction_id" IS NOT NULL));
