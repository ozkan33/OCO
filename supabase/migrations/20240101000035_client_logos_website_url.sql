-- Add website_url to client_logos so the landing page can link each logo
-- to the brand's site. Optional: blank means "not clickable".
ALTER TABLE client_logos
  ADD COLUMN IF NOT EXISTS website_url TEXT;
