-- Add "how did you hear about us" field to contact submissions
ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS heard_about TEXT DEFAULT '';
