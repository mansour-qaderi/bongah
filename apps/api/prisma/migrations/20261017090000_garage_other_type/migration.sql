/*
  A sixth kind of property: garages and anything else that is not a house, flat, shop, plot or garden.
  (The listing pin is free now, so nothing else changes in the database.)
*/

-- AlterEnum
ALTER TYPE "property_type" ADD VALUE 'GARAGE_OTHER';
