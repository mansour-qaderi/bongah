/*
  Admin panel, moderation and agency tooling.

  - users: banned_at / ban_reason (a ban hides and blocks, deletes nothing) and last_login_at.
  - abuse_reports: users report accounts and listings; admins work the queue.
  - agencies: a verification workflow (PENDING / VERIFIED / REJECTED). is_verified stays and is kept
    equal to "VERIFIED" by a CHECK constraint, so existing readers keep working.
  - properties: removed_by_admin_at / removal_reason (a moderation takedown the owner cannot undo).
  - property_view_days: views per listing per Kabul day, for the analytics charts.
  - transactions: receipt_number + paid_at, set by the statement that confirms the payment.
  - banners, pricing_overrides, admin_audit_logs, property_images.

  Existing rows keep working: agencies with is_verified = true become VERIFIED, every payment that
  already succeeded gets a receipt number, and nothing else is rewritten.
*/

-- CreateEnum
CREATE TYPE "agency_verification_status" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "abuse_target_type" AS ENUM ('USER', 'PROPERTY');

-- CreateEnum
CREATE TYPE "abuse_reason" AS ENUM ('SCAM', 'FAKE_LISTING', 'HARASSMENT', 'SPAM', 'WRONG_INFORMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "abuse_report_status" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "banner_placement" AS ENUM ('HOME_TOP', 'SEARCH_TOP');

-- CreateEnum
CREATE TYPE "pricing_key" AS ENUM ('SUBSCRIPTION_MONTHLY', 'SUBSCRIPTION_QUARTERLY', 'SUBSCRIPTION_YEARLY', 'LADDER', 'FEATURED_AD', 'MAP_LOCATION', 'CONTACT_CREDITS');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "banned_at" TIMESTAMPTZ(3),
ADD COLUMN     "ban_reason" TEXT,
ADD COLUMN     "last_login_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "agencies" ADD COLUMN     "verification_status" "agency_verification_status" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "reviewed_by_id" UUID,
ADD COLUMN     "rejection_reason" TEXT;

-- Agencies verified before the workflow existed stay verified (reviewed_by stays empty: no admin did it here).
UPDATE "agencies" SET "verification_status" = 'VERIFIED', "reviewed_at" = "updated_at" WHERE "is_verified";

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "removed_by_admin_at" TIMESTAMPTZ(3),
ADD COLUMN     "removal_reason" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "receipt_number" TEXT,
ADD COLUMN     "paid_at" TIMESTAMPTZ(3);

-- Receipt numbers: BNG-<Kabul year+month>-<running number>. One sequence for the whole table, so a
-- number is never reused. A rolled-back payment may leave a gap; these are receipts, not tax invoices.
CREATE SEQUENCE "receipt_number_seq";

CREATE FUNCTION "next_receipt_number"() RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'BNG-' || to_char((now() AT TIME ZONE 'UTC') + interval '270 minutes', 'YYYYMM') || '-'
         || CASE WHEN n < 1000000 THEN lpad(n::text, 6, '0') ELSE n::text END
    FROM (SELECT nextval('receipt_number_seq') AS n) AS next
$$;

-- Payments that already succeeded get a receipt too, dated by their last update (the moment they were confirmed).
UPDATE "transactions" AS t
   SET "paid_at" = t."updated_at", "receipt_number" = r."num"
  FROM (SELECT "id", "next_receipt_number"() AS "num" FROM "transactions" WHERE "status" = 'SUCCESS') AS r
 WHERE t."id" = r."id";

-- CreateTable
CREATE TABLE "property_view_days" (
    "property_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "property_view_days_pkey" PRIMARY KEY ("property_id","day")
);

-- CreateTable
CREATE TABLE "abuse_reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" "abuse_target_type" NOT NULL,
    "target_user_id" UUID NOT NULL,
    "target_property_id" UUID,
    "reason" "abuse_reason" NOT NULL,
    "details" TEXT,
    "status" "abuse_report_status" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abuse_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_property_id" UUID,
    "link_url" TEXT,
    "placement" "banner_placement" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_overrides" (
    "key" "pricing_key" NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "quantity" INTEGER,
    "updated_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pricing_overrides_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "property_images" (
    "id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_last_login_at_idx" ON "users"("last_login_at");

-- CreateIndex
CREATE INDEX "agencies_verification_status_created_at_idx" ON "agencies"("verification_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_receipt_number_key" ON "transactions"("receipt_number");

-- CreateIndex
CREATE INDEX "transactions_status_created_at_idx" ON "transactions"("status", "created_at");

-- CreateIndex
CREATE INDEX "property_view_days_day_idx" ON "property_view_days"("day");

-- CreateIndex
CREATE INDEX "abuse_reports_status_created_at_idx" ON "abuse_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "abuse_reports_target_user_id_status_idx" ON "abuse_reports"("target_user_id", "status");

-- CreateIndex
CREATE INDEX "abuse_reports_target_property_id_idx" ON "abuse_reports"("target_property_id");

-- CreateIndex
CREATE INDEX "abuse_reports_reporter_id_idx" ON "abuse_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_type_target_id_idx" ON "admin_audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actor_id_created_at_idx" ON "admin_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "banners_placement_is_active_sort_order_idx" ON "banners"("placement", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "property_images_uploader_id_created_at_idx" ON "property_images"("uploader_id", "created_at");

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_view_days" ADD CONSTRAINT "property_view_days_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_target_property_id_fkey" FOREIGN KEY ("target_property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_link_property_id_fkey" FOREIGN KEY ("link_property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_overrides" ADD CONSTRAINT "pricing_overrides_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

/*
  Rules Prisma cannot express. They are the last line of defence behind the service code: a bug (or a
  hand-run SQL fix) that breaks one fails loudly instead of leaving a quietly wrong row.
*/

-- A ban reason only exists while the account is banned.
ALTER TABLE "users" ADD CONSTRAINT "users_ban_reason_needs_ban" CHECK ("ban_reason" IS NULL OR "banned_at" IS NOT NULL);

-- The verified badge and the review status can never disagree; a rejection always says why; a decision
-- always has a time (and PENDING never does).
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_verified_matches_status" CHECK ("is_verified" = ("verification_status" = 'VERIFIED'));
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_rejection_reason_iff_rejected" CHECK (("verification_status" = 'REJECTED') = ("rejection_reason" IS NOT NULL));
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_reviewed_iff_decided" CHECK (("verification_status" = 'PENDING') = ("reviewed_at" IS NULL));

-- A takedown always says why.
ALTER TABLE "properties" ADD CONSTRAINT "properties_removal_reason_iff_removed" CHECK (("removed_by_admin_at" IS NULL) = ("removal_reason" IS NULL));

-- A receipt exists exactly for a confirmed payment, and comes with the time it was confirmed.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_receipt_iff_success" CHECK (
  ("status" = 'SUCCESS') = ("receipt_number" IS NOT NULL) AND ("receipt_number" IS NULL) = ("paid_at" IS NULL)
);

ALTER TABLE "property_view_days" ADD CONSTRAINT "property_view_days_count_positive" CHECK ("count" > 0);

-- Reports: a listing report names the listing (and a user report does not); nobody reports themselves;
-- an open report has no outcome and a closed one has who and when.
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_property_iff_property_target" CHECK (("target_type" = 'PROPERTY') = ("target_property_id" IS NOT NULL));
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_not_self" CHECK ("reporter_id" <> "target_user_id");
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_outcome_iff_closed" CHECK (("status" = 'OPEN') = ("resolved_at" IS NULL AND "resolved_by_id" IS NULL));
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_details_length" CHECK ("details" IS NULL OR char_length("details") <= 1000);
-- One person cannot pile up open reports about the same thing.
CREATE UNIQUE INDEX "abuse_reports_one_open_per_reporter_user" ON "abuse_reports"("reporter_id", "target_user_id") WHERE "status" = 'OPEN' AND "target_type" = 'USER';
CREATE UNIQUE INDEX "abuse_reports_one_open_per_reporter_property" ON "abuse_reports"("reporter_id", "target_property_id") WHERE "status" = 'OPEN' AND "target_type" = 'PROPERTY';

-- A banner links to a listing or to a web address, not both, and its window runs forward.
ALTER TABLE "banners" ADD CONSTRAINT "banners_one_link" CHECK ("link_property_id" IS NULL OR "link_url" IS NULL);
ALTER TABLE "banners" ADD CONSTRAINT "banners_window_order" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");

-- Prices are positive; only the products that come in packs / days can carry a quantity.
ALTER TABLE "pricing_overrides" ADD CONSTRAINT "pricing_overrides_price_positive" CHECK ("price" > 0);
ALTER TABLE "pricing_overrides" ADD CONSTRAINT "pricing_overrides_quantity_valid" CHECK (
  "quantity" IS NULL OR ("quantity" > 0 AND "key" IN ('FEATURED_AD', 'CONTACT_CREDITS'))
);

ALTER TABLE "property_images" ADD CONSTRAINT "property_images_size_positive" CHECK ("byte_size" > 0);
