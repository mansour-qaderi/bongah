-- Each subscription now has its own listing allowance (8 / 18 / 30 / 60 by plan), counted here.
ALTER TABLE "subscriptions" ADD COLUMN "listings_used" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_listings_used_nonneg" CHECK ("listings_used" >= 0);

-- Plans that already exist keep what their agency has published under them: the listings the agency created while the
-- plan ran, not counting those a bonus credit paid for. (A listing counts under every plan whose dates contain it, which
-- only matters for plans that overlap, and those are not created by purchases: a new plan starts when the running one
-- ends.)
UPDATE "subscriptions" s
   SET "listings_used" = (
     SELECT COUNT(*)
       FROM "properties" p
      WHERE p."agency_id" = s."agency_id"
        AND p."used_bonus_credit" = FALSE
        AND p."created_at" >= s."start_date"
        AND p."created_at" < s."end_date"
   );
