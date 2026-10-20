-- A listing can say how long its mortgage (گروی) runs, and whether its price is final (مقطوع) or open to an offer
-- (جورآمد). Both are optional; the duration is for mortgage listings only.
CREATE TYPE "price_terms" AS ENUM ('FIXED', 'NEGOTIABLE');

ALTER TABLE "properties" ADD COLUMN "mortgage_months" INTEGER;
ALTER TABLE "properties" ADD COLUMN "price_terms" "price_terms";

ALTER TABLE "properties" ADD CONSTRAINT "properties_mortgage_months_range"
  CHECK ("mortgage_months" IS NULL OR ("mortgage_months" BETWEEN 1 AND 600));
ALTER TABLE "properties" ADD CONSTRAINT "properties_mortgage_months_only_mortgage"
  CHECK ("mortgage_months" IS NULL OR "deal_type" = 'MORTGAGE_GROWI');
