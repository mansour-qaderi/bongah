/*
  First-time welcome card and the daily morning push.

  - users.enable_daily_motivation (default true) and users.has_seen_welcome.
    Accounts that exist when this migration runs are NOT first-time users: they are marked as having seen
    the welcome card, so nobody who has used the app for months gets a "welcome" on the next update.
    Only accounts created afterwards start with has_seen_welcome = false.
  - daily_quotes: the templates admins manage (welcome card text and morning push text, in Dari or Pashto).
  - push_devices: the phones a user can be pushed to.
  - morning_push_sends: one row per user per Kabul day. Its primary key is what stops a repeated or
    concurrent run from sending the same user twice.
*/

-- CreateEnum
CREATE TYPE "quote_category" AS ENUM ('WELCOME_ONBOARDING', 'MORNING_NOTIFICATION');

-- CreateEnum
CREATE TYPE "push_platform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "morning_push_status" AS ENUM ('CLAIMED', 'SENT', 'FAILED');

-- AlterTable: the DEFAULT true backfills every existing row, then the default for new rows becomes false.
ALTER TABLE "users" ADD COLUMN     "enable_daily_motivation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "has_seen_welcome" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ALTER COLUMN "has_seen_welcome" SET DEFAULT false;

-- CreateTable
CREATE TABLE "daily_quotes" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "category" "quote_category" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'prs',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "push_platform" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'prs',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "morning_push_sends" (
    "day" DATE NOT NULL,
    "user_id" UUID NOT NULL,
    "quote_id" UUID,
    "status" "morning_push_status" NOT NULL DEFAULT 'CLAIMED',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "morning_push_sends_pkey" PRIMARY KEY ("day","user_id")
);

-- CreateIndex
CREATE INDEX "daily_quotes_category_language_is_active_idx" ON "daily_quotes"("category", "language", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_user_id_idx" ON "push_devices"("user_id");

-- CreateIndex
CREATE INDEX "morning_push_sends_day_status_idx" ON "morning_push_sends"("day", "status");

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "morning_push_sends" ADD CONSTRAINT "morning_push_sends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "morning_push_sends" ADD CONSTRAINT "morning_push_sends_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "daily_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guards the application also enforces, kept in the database so no other writer can break them.
ALTER TABLE "daily_quotes" ADD CONSTRAINT "daily_quotes_language_known" CHECK ("language" IN ('prs', 'ps'));
ALTER TABLE "daily_quotes" ADD CONSTRAINT "daily_quotes_text_length" CHECK (char_length(btrim("text")) BETWEEN 1 AND 500);
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_language_known" CHECK ("language" IN ('prs', 'ps'));
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_token_length" CHECK (char_length("token") BETWEEN 10 AND 4096);
ALTER TABLE "morning_push_sends" ADD CONSTRAINT "morning_push_sends_error_only_if_failed" CHECK ("error" IS NULL OR "status" = 'FAILED');
