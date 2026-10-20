-- Ladders (نردبان) are earned by inviting friends and spent seven at a time: on one more listing once the free ones
-- are used up, or on a featured frame for one listing. A spent ladder now says what it was spent on; the older "bump
-- one listing" spends are kept as LADDER_BUMP.
CREATE TYPE "reward_spend" AS ENUM ('LADDER_BUMP', 'LISTING_QUOTA', 'FEATURED_FRAME');

ALTER TABLE "rewards" ADD COLUMN "spent_on" "reward_spend";
UPDATE "rewards" SET "spent_on" = 'LADDER_BUMP' WHERE "consumed_at" IS NOT NULL;

ALTER TABLE "rewards" DROP CONSTRAINT "rewards_ladder_token_spent_together";
ALTER TABLE "rewards"
  -- A ladder is either unspent, or spent on something: both columns are set together.
  ADD CONSTRAINT "rewards_ladder_token_spent_together" CHECK (
    "type" <> 'LADDER_TOKEN' OR (("consumed_at" IS NULL) = ("spent_on" IS NULL))),
  -- A spend on a listing's frame (or the old bump) names the listing; a listing quota names none.
  ADD CONSTRAINT "rewards_spent_on_listing" CHECK (
    "spent_on" IS NULL OR (("spent_on" = 'LISTING_QUOTA') = ("property_id" IS NULL)));
