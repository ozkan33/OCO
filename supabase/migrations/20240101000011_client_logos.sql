-- Client logos table: stores brand logos shown on the landing page
CREATE TABLE IF NOT EXISTS client_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow public read access (landing page is public)
ALTER TABLE client_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read client logos"
  ON client_logos FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage client logos"
  ON client_logos FOR ALL
  USING (true)
  WITH CHECK (true);
