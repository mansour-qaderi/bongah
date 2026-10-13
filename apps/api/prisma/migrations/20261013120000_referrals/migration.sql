/*
  Referrals and rewards.

  - users.referral_code: every user's own invite code, unique, filled by the database
    (generate_referral_code()) so a user created by ANY path (signup, seed, test helper) has one.
    Existing users are backfilled here.
  - users.referred_by_id: who invited this user (set once at signup).
  - rewards: what people earned by inviting a friend or by being invited.

  Only LADDER_TOKEN rewards do anything yet; BONUS_LISTING and SUBSCRIPTION_EXTENSION are reserved.
*/

-- A referral code is 8 characters from the 32 below: no I, O, 0 or 1, which people misread when they
-- type a code from a message. The same alphabet is REFERRAL_CODE_ALPHABET in packages/validation
-- (apps/api/src/referral/referral.migration.spec.ts fails if the two ever differ).
-- Not secret and not guessable enough to matter: knowing a code only lets someone invite themselves
-- in. Two inserts racing to the same code are stopped by the UNIQUE index below (1 in ~10^12 odds).
CREATE FUNCTION generate_referral_code() RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..8 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    END LOOP;
    -- VOLATILE, so inside one transaction it sees the codes handed out a moment ago (the backfill below).
    EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE referral_code = candidate);
  END LOOP;
  RETURN candidate;
END
$$;

-- CreateEnum
CREATE TYPE "reward_type" AS ENUM ('LADDER_TOKEN', 'BONUS_LISTING', 'SUBSCRIPTION_EXTENSION');

-- CreateEnum
CREATE TYPE "reward_reason" AS ENUM ('REFERRER_BONUS', 'REFEREE_BONUS');

-- AlterTable: nullable first, so the existing rows can be filled before the column becomes required
ALTER TABLE "users" ADD COLUMN "referral_code" TEXT,
ADD COLUMN "referred_by_id" UUID;

-- Backfill, one row per statement so each call sees the codes already handed out
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM users WHERE referral_code IS NULL LOOP
    UPDATE users SET referral_code = generate_referral_code() WHERE id = r.id;
  END LOOP;
END
$$;

ALTER TABLE "users" ALTER COLUMN "referral_code" SET NOT NULL,
ALTER COLUMN "referral_code" SET DEFAULT generate_referral_code();

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_referred_by_id_idx" ON "users"("referred_by_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "reward_type" NOT NULL,
    "reason" "reward_reason" NOT NULL,
    "invitee_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "consumed_at" TIMESTAMPTZ(3),
    "property_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rewards_user_id_type_reason_invitee_id_key" ON "rewards"("user_id", "type", "reason", "invitee_id");

-- CreateIndex
CREATE INDEX "rewards_user_id_type_consumed_at_idx" ON "rewards"("user_id", "type", "consumed_at");

-- CreateIndex
CREATE INDEX "rewards_invitee_id_idx" ON "rewards"("invitee_id");

-- CreateIndex
CREATE INDEX "rewards_property_id_idx" ON "rewards"("property_id");

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma cannot express, enforced by the database so no code path can break them.
-- (Prisma ignores CHECK constraints when it compares the database to the schema.)
ALTER TABLE "users"
  ADD CONSTRAINT "users_referral_code_format" CHECK ("referral_code" ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  ADD CONSTRAINT "users_not_self_referred" CHECK ("referred_by_id" IS NULL OR "referred_by_id" <> "id");

ALTER TABLE "rewards"
  ADD CONSTRAINT "rewards_amount_positive" CHECK ("amount" > 0),
  -- One row is one token: redeeming spends a row, so a ladder token can't be worth more than 1.
  ADD CONSTRAINT "rewards_ladder_token_is_one" CHECK ("type" <> 'LADDER_TOKEN' OR "amount" = 1),
  -- The invited friend receives their own REFEREE_BONUS; everyone else's reward is a REFERRER_BONUS.
  ADD CONSTRAINT "rewards_recipient_matches_reason" CHECK (
    ("reason" = 'REFEREE_BONUS' AND "user_id" = "invitee_id") OR
    ("reason" = 'REFERRER_BONUS' AND "user_id" <> "invitee_id")),
  -- A ladder token is either unspent, or spent on a listing: both columns set together.
  ADD CONSTRAINT "rewards_ladder_token_spent_together" CHECK (
    "type" <> 'LADDER_TOKEN' OR (("consumed_at" IS NULL) = ("property_id" IS NULL)));
