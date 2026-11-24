-- Extra choices for the scorecard "3B Contact" dropdown, on top of the
-- built-in ones. Shared by every scorecard. Only Admins can add (enforced in
-- /api/contact-options); no client policies, so access is service-role only.
CREATE TABLE IF NOT EXISTS contact_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_options_label ON contact_options (lower(label));
ALTER TABLE contact_options ENABLE ROW LEVEL SECURITY;
