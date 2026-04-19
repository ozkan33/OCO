-- Market visit location provenance: record WHERE the coords came from,
-- how accurate they are, and when the photo itself was taken (not uploaded).
-- Enables future debugging of off-location pins and source-specific analytics.

ALTER TABLE market_visits
  ADD COLUMN IF NOT EXISTS accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_source TEXT
    CHECK (location_source IN ('exif', 'geolocation', 'manual')),
  ADD COLUMN IF NOT EXISTS photo_taken_at TIMESTAMPTZ;
