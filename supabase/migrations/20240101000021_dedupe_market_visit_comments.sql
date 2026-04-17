-- Remove duplicate market-visit comments introduced when the legacy backfill
-- inserted `[Market Visit — DATE] note` alongside a pre-existing live
-- `[Market Visit — DATE · STORE] note` on the same (scorecard_id, row_id,
-- parent_row_id, user_id). The two rows can differ by text format (legacy vs.
-- live) yet render identically in the UI (GET enriches legacy on read).
--
-- Strategy: partition by the *content identity* — visit date plus note body
-- extracted from the bracket prefix — so legacy and live rows collapse into
-- the same group and we keep one. Prefer the live-format row when present (it
-- has the authoritative store segment); otherwise keep the earliest row.

WITH parsed AS (
  SELECT
    id,
    scorecard_id,
    COALESCE(parent_row_id, '') AS pid,
    row_id,
    user_id,
    created_at,
    -- visit date from the `[Market Visit — YYYY-MM-DD` prefix (present in both formats)
    substring(text from '^\[Market Visit — (\d{4}-\d{2}-\d{2})') AS visit_date,
    -- body after the closing bracket, trimmed — same in legacy and live
    regexp_replace(text, '^\[Market Visit — \d{4}-\d{2}-\d{2}(?: · [^\]]*)?\]\s*', '') AS body,
    -- live rows contain the ` · ` separator; prefer them on tie-break
    (text ~ '^\[Market Visit — \d{4}-\d{2}-\d{2} · ')::int AS is_live
  FROM comments
  WHERE text ~ '^\[Market Visit — \d{4}-\d{2}-\d{2}'
),
ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY scorecard_id, pid, row_id, user_id, visit_date, body
      ORDER BY is_live DESC, created_at ASC, id ASC
    ) AS rn
  FROM parsed
)
DELETE FROM comments
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
