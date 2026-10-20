/*
  A six-month plan, and a welcome gift of one listing.

  - subscription_package / pricing_key get SEMIANNUAL / SUBSCRIPTION_SEMIANNUAL, between the quarterly and the yearly
    plan. The values are only added here and not used, so this is safe inside one transaction (PostgreSQL 12+).
  - users.welcome_listing_credits: gift listings left. Every existing account has none (the gift is for accounts
    created from now on: the application sets it to 1 when it creates one), and it can never go below zero.
  - properties.used_welcome_credit: the listing was paid for with the gift, so it does not count toward the
    monthly free listing. Every existing listing is false.
*/

-- AlterEnum
ALTER TYPE "subscription_package" ADD VALUE IF NOT EXISTS 'SEMIANNUAL' BEFORE 'YEARLY';

-- AlterEnum
ALTER TYPE "pricing_key" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_SEMIANNUAL' BEFORE 'SUBSCRIPTION_YEARLY';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "welcome_listing_credits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD CONSTRAINT "users_welcome_listing_credits_nonnegative" CHECK ("welcome_listing_credits" >= 0);

-- AlterTable
ALTER TABLE "properties" ADD COLUMN "used_welcome_credit" BOOLEAN NOT NULL DEFAULT false;
