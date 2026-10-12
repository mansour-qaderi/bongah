-- CreateEnum
CREATE TYPE "role" AS ENUM ('USER', 'AGENCY', 'ADMIN');

-- CreateEnum
CREATE TYPE "property_type" AS ENUM ('APARTMENT', 'HOUSE_HAWILI', 'LAND', 'OFFICE_SHOP');

-- CreateEnum
CREATE TYPE "deal_type" AS ENUM ('SALE', 'RENT', 'MORTGAGE_GROWI');

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('AFGHANI', 'USD');

-- CreateEnum
CREATE TYPE "property_status" AS ENUM ('ACTIVE', 'SOLD', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "subscription_package" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "transaction_purpose" AS ENUM ('SUBSCRIPTION', 'LADDER', 'FEATURED_AD');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "full_name" TEXT,
    "role" "role" NOT NULL DEFAULT 'USER',
    "avatar" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agency_name" TEXT NOT NULL,
    "license_photo" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agency_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "property_type" NOT NULL,
    "deal_type" "deal_type" NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" "currency" NOT NULL,
    "area_sqm" DOUBLE PRECISION NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "property_status" NOT NULL DEFAULT 'ACTIVE',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "laddered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "package_type" "subscription_package" NOT NULL,
    "start_date" TIMESTAMPTZ(3) NOT NULL,
    "end_date" TIMESTAMPTZ(3) NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "hesabpay_tx_id" TEXT NOT NULL,
    "purpose" "transaction_purpose" NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_user_id_key" ON "agencies"("user_id");

-- CreateIndex
CREATE INDEX "properties_user_id_created_at_idx" ON "properties"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "properties_agency_id_idx" ON "properties"("agency_id");

-- CreateIndex
CREATE INDEX "properties_status_province_district_idx" ON "properties"("status", "province", "district");

-- CreateIndex
CREATE INDEX "properties_lat_lng_idx" ON "properties"("lat", "lng");

-- CreateIndex
CREATE INDEX "subscriptions_agency_id_status_end_date_idx" ON "subscriptions"("agency_id", "status", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_hesabpay_tx_id_key" ON "transactions"("hesabpay_tx_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_created_at_idx" ON "transactions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
