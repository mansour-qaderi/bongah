-- A manual payment can now be backed by the transaction id from the customer's receipt, typed in instead of (or
-- together with) the receipt picture. The admin checks it against the HesabPay / bank history and approves.

ALTER TABLE "transactions"
  ADD COLUMN "payment_reference"      TEXT,
  ADD COLUMN "reference_submitted_at" TIMESTAMPTZ(3);

ALTER TABLE "transactions"
  -- Set together or not at all, and only on a manual payment.
  ADD CONSTRAINT "transactions_reference_all_or_none" CHECK (
    ("payment_reference" IS NULL AND "reference_submitted_at" IS NULL)
    OR ("payment_reference" IS NOT NULL AND "reference_submitted_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "transactions_reference_only_manual" CHECK ("payment_reference" IS NULL OR "method" = 'MANUAL'),
  ADD CONSTRAINT "transactions_reference_length" CHECK ("payment_reference" IS NULL OR char_length("payment_reference") BETWEEN 4 AND 64);

-- One transfer pays for one purchase: while a payment is waiting or confirmed, nobody else can attach the same reference
-- (case does not matter). A refused payment frees it, because the customer may have mistyped.
CREATE UNIQUE INDEX "transactions_live_payment_reference_key"
  ON "transactions" (lower("payment_reference"))
  WHERE "payment_reference" IS NOT NULL AND "status" IN ('PENDING', 'SUCCESS');
