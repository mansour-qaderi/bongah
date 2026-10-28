-- Two things, both about getting a new account to its first listings without a payment gateway in the way.
--
-- 1. Manual payments. A customer can pay by hand (HesabPay app or card-to-card), upload a picture of the receipt, and
--    an admin confirms it. A manual payment is an ordinary transactions row (same PENDING -> SUCCESS flip, same receipt
--    number, same delivery); these columns say how it is settled, where the receipt picture is, and who decided.
-- 2. The agency free trial. A new agency may publish without a subscription until trial_ends_at, up to a listing limit
--    that is counted in trial_listings_used (the limit itself is an operator setting, not stored here).

CREATE TYPE "transaction_method" AS ENUM ('GATEWAY', 'MANUAL');

ALTER TABLE "transactions"
  ADD COLUMN "method"             "transaction_method" NOT NULL DEFAULT 'GATEWAY',
  ADD COLUMN "proof_image_id"     UUID,
  ADD COLUMN "proof_content_type" TEXT,
  ADD COLUMN "proof_byte_size"    INTEGER,
  ADD COLUMN "proof_uploaded_at"  TIMESTAMPTZ(3),
  ADD COLUMN "reviewed_by_id"     UUID,
  ADD COLUMN "reviewed_at"        TIMESTAMPTZ(3),
  ADD COLUMN "review_note"        TEXT,
  ADD COLUMN "force_activated"    BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The receipt picture is either fully described or absent, and only a manual payment can have one.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_proof_all_or_none" CHECK (
    ("proof_image_id" IS NULL AND "proof_content_type" IS NULL AND "proof_byte_size" IS NULL AND "proof_uploaded_at" IS NULL)
    OR ("proof_image_id" IS NOT NULL AND "proof_content_type" IS NOT NULL AND "proof_byte_size" > 0 AND "proof_uploaded_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "transactions_proof_only_manual" CHECK ("proof_image_id" IS NULL OR "method" = 'MANUAL'),
  -- "Activated without a receipt picture" only makes sense for a payment that is activated.
  ADD CONSTRAINT "transactions_force_needs_success" CHECK ("force_activated" = false OR "status" = 'SUCCESS');

CREATE INDEX "transactions_method_status_created_at_idx" ON "transactions"("method", "status", "created_at");

ALTER TABLE "agencies"
  ADD COLUMN "trial_ends_at"       TIMESTAMPTZ(3),
  ADD COLUMN "trial_listings_used" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "agencies_trial_listings_used_non_negative" CHECK ("trial_listings_used" >= 0);

-- Agencies that exist today get the same 30 days, counted from this migration: they were registered when publishing
-- needed a subscription from day one, so counting from their registration would give most of them nothing. (New
-- agencies get their trial when they register, with the length the operator configured.)
UPDATE "agencies" SET "trial_ends_at" = now() + interval '30 days' WHERE "trial_ends_at" IS NULL;
