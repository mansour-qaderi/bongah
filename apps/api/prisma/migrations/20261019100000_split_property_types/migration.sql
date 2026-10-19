/*
  One property type per kind, and a free-text unit.

  - The three combined types are split: OFFICE_SHOP into SHOP and OFFICE, GARDEN_VILLA into GARDEN and VILLA,
    GARAGE_OTHER into GARAGE and OTHER. Existing listings are moved by the unit they carried (properties.unit_type):
      OFFICE_SHOP  + unit OFFICE            -> OFFICE        (anything else, including none -> SHOP)
      GARDEN_VILLA + unit VILLA             -> VILLA         (anything else, including none -> GARDEN)
      GARAGE_OTHER + unit GARAGE            -> GARAGE        (anything else, including none -> OTHER)
    Every other type keeps its value.
  - properties.unit: which unit of a building ("واحد ۳"), free text, nullable. Every existing listing simply has none.
  - properties.unit_type and the property_unit enum are left in place, unused (nothing reads or writes them any
    more), so no data is lost. A later migration can drop them.

  The type is replaced rather than extended (ALTER TYPE ... ADD VALUE): a new value cannot be used in the same
  transaction that adds it, and the old combined values would otherwise stay in the enum for ever.
*/

-- CreateEnum
CREATE TYPE "property_type_new" AS ENUM ('HOUSE_HAWILI', 'APARTMENT', 'SHOP', 'OFFICE', 'LAND', 'GARDEN', 'VILLA', 'GARAGE', 'OTHER');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "unit" VARCHAR(40);

-- Move every listing to its new type
ALTER TABLE "properties"
  ALTER COLUMN "type" TYPE "property_type_new"
  USING (
    CASE
      WHEN "type"::text = 'OFFICE_SHOP' THEN
        CASE WHEN "unit_type"::text = 'OFFICE' THEN 'OFFICE' ELSE 'SHOP' END
      WHEN "type"::text = 'GARDEN_VILLA' THEN
        CASE WHEN "unit_type"::text = 'VILLA' THEN 'VILLA' ELSE 'GARDEN' END
      WHEN "type"::text = 'GARAGE_OTHER' THEN
        CASE WHEN "unit_type"::text = 'GARAGE' THEN 'GARAGE' ELSE 'OTHER' END
      ELSE "type"::text
    END
  )::"property_type_new";

-- DropEnum
DROP TYPE "property_type";

-- Rename
ALTER TYPE "property_type_new" RENAME TO "property_type";
