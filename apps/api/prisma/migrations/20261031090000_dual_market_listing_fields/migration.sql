-- Dual-market listing form: Iran's four property types, mortgage-and-rent with a monthly rent, feature tags, and the
-- Afghan deed type, plus Godam (warehouse) for Afghanistan.
--
-- New enum values cannot be used in the transaction that adds them, and nothing here does. Existing rows are untouched.

ALTER TYPE "property_type" ADD VALUE IF NOT EXISTS 'WAREHOUSE';
ALTER TYPE "property_type" ADD VALUE IF NOT EXISTS 'LAND_OLD';
ALTER TYPE "property_type" ADD VALUE IF NOT EXISTS 'VILLA_GARDEN';
ALTER TYPE "deal_type"     ADD VALUE IF NOT EXISTS 'MORTGAGE_RENT';

CREATE TYPE "property_feature" AS ENUM ('DUPLEX', 'PENTHOUSE', 'SINGLE_DEED', 'MASTER_ROOM', 'ELEVATOR', 'PARKING', 'STORAGE');
CREATE TYPE "deed_type" AS ENUM ('SHARI', 'ORFI');

ALTER TABLE "properties" ADD COLUMN "monthly_rent" DECIMAL(18, 2);
ALTER TABLE "properties" ADD COLUMN "features" "property_feature"[] NOT NULL DEFAULT ARRAY[]::"property_feature"[];
ALTER TABLE "properties" ADD COLUMN "deed_type" "deed_type";

-- "has ALL of these tags" filters use @>
CREATE INDEX "properties_features_idx" ON "properties" USING GIN ("features");
