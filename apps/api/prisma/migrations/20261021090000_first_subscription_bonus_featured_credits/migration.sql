/*
  A bonus for a first subscription, featured-listing bundles, and a monthly listing allowance for agencies.

  - transaction_purpose gets FEATURED_CREDITS (a bundle of featured-listing credits). The value is only added here and
    not used, so this is safe inside one transaction (PostgreSQL 12+).
  - users.bonus_listing_credits: extra listings an agency can publish after its month's allowance is spent.
  - users.featured_credits: featured-listing credits left. Each makes a listing featured for the usual number of days.
  - Both can never go below zero.
  - users.first_subscription_bonus_at: when the first-subscription bonus was given. It is set in the same transaction
    as the grant, so the bonus can only be given once. Accounts whose agency already has a subscription are not "first
    time": they get it set here and never receive the bonus.
  - properties.used_bonus_credit: the listing was paid for with a bonus credit, so it does not count toward the
    month's allowance. Every existing listing is false.
*/

-- AlterEnum
ALTER TYPE "transaction_purpose" ADD VALUE IF NOT EXISTS 'FEATURED_CREDITS';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "bonus_listing_credits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "featured_credits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "first_subscription_bonus_at" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD CONSTRAINT "users_bonus_listing_credits_nonnegative" CHECK ("bonus_listing_credits" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_featured_credits_nonnegative" CHECK ("featured_credits" >= 0);

-- Anyone who has already subscribed is not buying a first subscription.
UPDATE "users" u
   SET "first_subscription_bonus_at" = now()
 WHERE EXISTS (
   SELECT 1 FROM "subscriptions" s JOIN "agencies" a ON a."id" = s."agency_id" WHERE a."user_id" = u."id"
 );

-- AlterTable
ALTER TABLE "properties" ADD COLUMN "used_bonus_credit" BOOLEAN NOT NULL DEFAULT false;
