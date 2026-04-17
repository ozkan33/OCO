-- Migration 20240101000020 rewrote `text` on legacy-format market-visit rows to
-- embed the store name. Supabase's moddatetime trigger on `comments` bumped
-- `updated_at` as a side-effect, which makes the UI show "(edited)" on rows
-- the user never actually edited.
--
-- Reset `updated_at = created_at` for every market-visit auto-comment. These
-- rows are machine-generated (`[Market Visit — DATE · STORE] body`) so in
-- practice users don't edit them directly; clearing the spurious edit marker
-- is far more valuable than preserving it.

UPDATE comments
SET updated_at = created_at
WHERE text ~ '^\[Market Visit — \d{4}-\d{2}-\d{2}'
  AND updated_at IS NOT NULL
  AND created_at IS NOT NULL
  AND updated_at > created_at;
