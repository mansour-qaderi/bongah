-- Multi-market support: Afghanistan (AF) and Iran (IR).
--
-- Everything that exists today is Afghan, so every new market column defaults to 'AF' and no existing row changes.

CREATE TYPE "market" AS ENUM ('AF', 'IR');

-- New kinds. (A value added in this transaction cannot be used in it, and nothing here does.)
ALTER TYPE "currency" ADD VALUE IF NOT EXISTS 'TOMAN';
ALTER TYPE "currency" ADD VALUE IF NOT EXISTS 'RIAL';
ALTER TYPE "deal_type" ADD VALUE IF NOT EXISTS 'DAILY_RENT';
ALTER TYPE "property_type" ADD VALUE IF NOT EXISTS 'DUPLEX';
ALTER TYPE "property_type" ADD VALUE IF NOT EXISTS 'COMMERCIAL';

ALTER TABLE "users"        ADD COLUMN "market" "market" NOT NULL DEFAULT 'AF';
ALTER TABLE "properties"   ADD COLUMN "market" "market" NOT NULL DEFAULT 'AF';
ALTER TABLE "transactions" ADD COLUMN "market" "market" NOT NULL DEFAULT 'AF';

-- A price in rials runs to the trillions (a 200-billion-toman villa is 2 * 10^12 rials).
ALTER TABLE "properties" ALTER COLUMN "price" TYPE DECIMAL(18, 2);

CREATE INDEX "properties_market_status_idx" ON "properties" ("market", "status");
