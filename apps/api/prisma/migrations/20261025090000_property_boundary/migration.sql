-- The outline of a listing's plot, drawn on the map in the app: a GeoJSON Polygon ([lng, lat], one closed ring). The
-- API checks its shape (plotBoundarySchema); the database only makes sure it is a JSON object and never sits on a
-- listing without a pin, because the map finds listings by their pin.
ALTER TABLE "properties" ADD COLUMN "boundary" JSONB;

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_boundary_is_object" CHECK ("boundary" IS NULL OR jsonb_typeof("boundary") = 'object'),
  ADD CONSTRAINT "properties_boundary_needs_pin" CHECK ("boundary" IS NULL OR ("lat" IS NOT NULL AND "lng" IS NOT NULL));
