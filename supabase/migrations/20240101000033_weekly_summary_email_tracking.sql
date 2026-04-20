-- Migration: Track "Your Week in Review" email sends per weekly summary.
-- Used by /api/admin/weekly-summary/send-email and the Monday cron.
-- recipients is a jsonb array like: [{"email":"...","name":"...","sent_at":"..."}]
-- so the admin UI can show who the recap went to and when.

ALTER TABLE weekly_summaries
  ADD COLUMN IF NOT EXISTS email_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_to  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_error    text;
