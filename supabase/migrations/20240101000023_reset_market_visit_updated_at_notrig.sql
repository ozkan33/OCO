-- Migration 20240101000022 tried to reset `updated_at = created_at` on
-- market-visit auto-comments, but the comments table has a moddatetime trigger
-- that bumps `updated_at` on every UPDATE — including ours — so the "(edited)"
-- badge never actually cleared.
--
-- Do it again inside DISABLE TRIGGER USER so moddatetime doesn't fire while we
-- rewrite the timestamps. USER scope leaves system/FK triggers intact.

ALTER TABLE comments DISABLE TRIGGER USER;

UPDATE comments
SET updated_at = created_at
WHERE text ~ '^\[Market Visit — \d{4}-\d{2}-\d{2}'
  AND updated_at IS NOT NULL
  AND created_at IS NOT NULL
  AND updated_at > created_at;

ALTER TABLE comments ENABLE TRIGGER USER;
