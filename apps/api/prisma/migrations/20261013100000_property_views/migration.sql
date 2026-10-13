/*
  Listing view counter, for the agency dashboard ("total views").

  Existing listings start at 0: views were never recorded before this, so there is nothing to backfill.
*/

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- A counter only goes up from zero. (Prisma ignores CHECK constraints when it compares the database to the schema.)
ALTER TABLE "properties" ADD CONSTRAINT "properties_view_count_non_negative" CHECK ("view_count" >= 0);
