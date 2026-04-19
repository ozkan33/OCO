-- Make the market-photos bucket private and serve it via signed URLs.
-- Storing public URLs allowed anyone with the URL (e.g. leaked in a screenshot
-- or forwarded email) to retrieve store photos indefinitely, and those photos
-- can contain EXIF GPS data revealing staff home locations. The API now
-- generates short-lived signed URLs for authenticated admins instead.

INSERT INTO storage.buckets (id, name, public)
VALUES ('market-photos', 'market-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;
