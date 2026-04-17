-- Backfill store name into legacy market-visit auto-comments.
--
-- Before 2026-04-16 the market-visit flow saved comments as:
--   [Market Visit — YYYY-MM-DD] note
-- We now embed the visited store so the UI can show *which* visit the note
-- came from:
--   [Market Visit — YYYY-MM-DD · Store Name] note
-- This migration rewrites any legacy comments in place by joining back to the
-- market_visits row on (user_id, visit_date, note). Idempotent: the update
-- only matches texts that don't yet have the store segment.

UPDATE comments c
SET text = '[Market Visit — '
  || substring(c.text from '^\[Market Visit — (\d{4}-\d{2}-\d{2})\] ')
  || ' · ' || mv.store_name || '] '
  || substring(c.text from '^\[Market Visit — \d{4}-\d{2}-\d{2}\] (.*)$')
FROM market_visits mv
WHERE mv.user_id = c.user_id
  AND c.text ~ '^\[Market Visit — \d{4}-\d{2}-\d{2}\] '
  AND c.text !~ '^\[Market Visit — \d{4}-\d{2}-\d{2} · '
  AND to_char(mv.visit_date, 'YYYY-MM-DD')
      = substring(c.text from '^\[Market Visit — (\d{4}-\d{2}-\d{2})\] ')
  AND mv.note
      = substring(c.text from '^\[Market Visit — \d{4}-\d{2}-\d{2}\] (.*)$')
  AND mv.store_name IS NOT NULL
  AND mv.store_name <> '';
