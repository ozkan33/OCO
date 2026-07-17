-- Per-brand weekly-email opt-out.
-- A brand absent from this table is treated as enabled (default behavior),
-- so existing brands keep receiving the "Your Week in Review" recap until an
-- admin explicitly turns them off. Enforced centrally in sendWeeklySummaryEmail,
-- which covers BOTH the Monday cron auto-send and the manual per-contact send.

CREATE TABLE IF NOT EXISTS brand_email_prefs (
  brand_name           TEXT PRIMARY KEY,
  weekly_email_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           UUID REFERENCES auth.users(id)
);

-- Access is service-role only (admin API routes via supabaseAdmin). Enable RLS
-- with no policies so the anon/authenticated keys can't read or write it.
ALTER TABLE brand_email_prefs ENABLE ROW LEVEL SECURITY;
