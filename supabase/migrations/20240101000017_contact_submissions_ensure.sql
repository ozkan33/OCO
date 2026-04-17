-- Ensure contact_submissions table and all expected columns exist.
-- Prior migrations only ALTER'd this table; originally created via Supabase Studio.
-- This is an idempotent safety net so the public contact form (/api/contact) works
-- on any environment (local, staging, prod) regardless of historical manual setup.

CREATE TABLE IF NOT EXISTS contact_submissions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  product TEXT NOT NULL,
  category TEXT NOT NULL,
  distribution TEXT DEFAULT '',
  challenge TEXT DEFAULT '',
  heard_about TEXT DEFAULT '',
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS name         TEXT;
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS email        TEXT;
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS product      TEXT;
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS category     TEXT;
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS distribution TEXT DEFAULT '';
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS challenge    TEXT DEFAULT '';
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS heard_about  TEXT DEFAULT '';
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS message      TEXT DEFAULT '';
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT NOW();

-- Writes go through the service role from /api/contact (bypasses RLS),
-- but enable RLS + a restrictive policy so no one else can read submissions.
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct access to contact_submissions" ON contact_submissions;
CREATE POLICY "No direct access to contact_submissions"
  ON contact_submissions FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
