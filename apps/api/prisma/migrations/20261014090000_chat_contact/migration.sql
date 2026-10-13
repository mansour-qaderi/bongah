/*
  Chat, direct contact and paid contact reveals.

  - conversations / messages / chat_images / chat_templates: in-app chat between a buyer and the
    owner of a listing (text, pictures, map pins, saved replies, one auto-reply).
  - contact_unlock_logs: which phone numbers a user revealed on which Kabul day (the daily free limit
    counts these).
  - user_credits: batches of prepaid / earned contact reveal credits.
  - transactions.quantity + CONTACT_CREDITS: buying a pack of credits through HesabPay.

  Nothing existing is rewritten. Whether an agency has unlimited reveals is computed from its
  subscriptions, so no perks table exists here.
*/

-- AlterEnum
ALTER TYPE "transaction_purpose" ADD VALUE 'CONTACT_CREDITS';

-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('TEXT', 'IMAGE', 'LOCATION');

-- CreateEnum
CREATE TYPE "contact_unlock_method" AS ENUM ('FREE_DAILY', 'CREDIT', 'PERK');

-- CreateEnum
CREATE TYPE "contact_credit_source" AS ENUM ('PURCHASE', 'REFERRAL', 'ADMIN_GRANT');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "quantity" INTEGER;

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "agency_id" UUID,
    "auto_reply_sent_at" TIMESTAMPTZ(3),
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "type" "message_type" NOT NULL,
    "body" TEXT,
    "image_id" UUID,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "is_auto_reply" BOOLEAN NOT NULL DEFAULT false,
    "client_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_images" (
    "id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_templates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "is_auto_reply" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_unlock_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "contact_user_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "day_key" DATE NOT NULL,
    "method" "contact_unlock_method" NOT NULL,
    "credit_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_unlock_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "contact_credit_source" NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "transaction_id" UUID,
    "invitee_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_buyer_id_last_message_at_idx" ON "conversations"("buyer_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_seller_id_last_message_at_idx" ON "conversations"("seller_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_property_id_buyer_id_key" ON "conversations"("property_id", "buyer_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_image_id_key" ON "messages"("image_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_id_idx" ON "messages"("conversation_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_read_at_idx" ON "messages"("conversation_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_sender_id_client_id_key" ON "messages"("conversation_id", "sender_id", "client_id");

-- CreateIndex
CREATE INDEX "chat_images_uploader_id_created_at_idx" ON "chat_images"("uploader_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_templates_user_id_created_at_idx" ON "chat_templates"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "contact_unlock_logs_user_id_day_key_method_idx" ON "contact_unlock_logs"("user_id", "day_key", "method");

-- CreateIndex
CREATE INDEX "contact_unlock_logs_property_id_idx" ON "contact_unlock_logs"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_unlock_logs_user_id_contact_user_id_day_key_key" ON "contact_unlock_logs"("user_id", "contact_user_id", "day_key");

-- CreateIndex
CREATE UNIQUE INDEX "user_credits_transaction_id_key" ON "user_credits"("transaction_id");

-- CreateIndex
CREATE INDEX "user_credits_user_id_remaining_idx" ON "user_credits"("user_id", "remaining");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "chat_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_images" ADD CONSTRAINT "chat_images_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_templates" ADD CONSTRAINT "chat_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_unlock_logs" ADD CONSTRAINT "contact_unlock_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_unlock_logs" ADD CONSTRAINT "contact_unlock_logs_contact_user_id_fkey" FOREIGN KEY ("contact_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_unlock_logs" ADD CONSTRAINT "contact_unlock_logs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_unlock_logs" ADD CONSTRAINT "contact_unlock_logs_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "user_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

/*
  Rules Prisma cannot express. They are the last line of defence behind the service code: a bug (or a
  hand-run SQL fix) that breaks one fails loudly instead of leaving a quietly wrong row.
*/

-- A conversation is between two different people.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_not_seller" CHECK ("buyer_id" <> "seller_id");

-- Which message fields are filled follows its type. TEXT has text and nothing else; IMAGE has a
-- picture (and maybe a caption); LOCATION has both coordinates (and maybe a note).
ALTER TABLE "messages" ADD CONSTRAINT "messages_fields_match_type" CHECK (
  ("type" = 'TEXT'     AND "body" IS NOT NULL AND char_length(btrim("body")) > 0
                       AND "image_id" IS NULL AND "lat" IS NULL AND "lng" IS NULL)
  OR ("type" = 'IMAGE' AND "image_id" IS NOT NULL AND "lat" IS NULL AND "lng" IS NULL)
  OR ("type" = 'LOCATION' AND "lat" IS NOT NULL AND "lng" IS NOT NULL AND "image_id" IS NULL)
);
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_length" CHECK ("body" IS NULL OR char_length("body") <= 2000);
ALTER TABLE "messages" ADD CONSTRAINT "messages_coordinates_valid" CHECK (
  ("lat" IS NULL OR "lat" BETWEEN -90 AND 90) AND ("lng" IS NULL OR "lng" BETWEEN -180 AND 180)
);

ALTER TABLE "chat_images" ADD CONSTRAINT "chat_images_size_positive" CHECK ("byte_size" > 0);

-- A saved reply is 1-500 characters, and a user has at most ONE automatic reply.
ALTER TABLE "chat_templates" ADD CONSTRAINT "chat_templates_body_length" CHECK (char_length(btrim("body")) BETWEEN 1 AND 500);
CREATE UNIQUE INDEX "chat_templates_one_auto_reply_per_user" ON "chat_templates"("user_id") WHERE "is_auto_reply";

-- Only a paid-with-credit reveal points at a credit batch, and every one does.
ALTER TABLE "contact_unlock_logs" ADD CONSTRAINT "contact_unlock_logs_credit_iff_method" CHECK (("method" = 'CREDIT') = ("credit_id" IS NOT NULL));

-- Credits: a batch holds at least one, and what is left is between none and what it started with.
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_remaining_in_range" CHECK ("remaining" >= 0 AND "remaining" <= "amount");
-- Same shape as map_location_tokens: a purchase has its payment and only a purchase does; a
-- referral batch names the invited friend and only a referral does.
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_purchase_has_payment" CHECK (("source" = 'PURCHASE') = ("transaction_id" IS NOT NULL));
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_referral_has_invitee" CHECK (("source" = 'REFERRAL') = ("invitee_id" IS NOT NULL));
-- A friend's signup pays out once (retries and concurrent signups cannot mint it twice).
CREATE UNIQUE INDEX "user_credits_one_per_referral" ON "user_credits"("user_id", "invitee_id") WHERE "source" = 'REFERRAL';

-- A pack size recorded on a payment is a positive number.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_quantity_positive" CHECK ("quantity" IS NULL OR "quantity" > 0);
