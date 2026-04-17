-- Wipe auto-generated market-visit comments so the backfill route can
-- re-attribute them with the new strict matcher. The source of truth is the
-- `market_visits` table — each row there will be re-synthesized into a
-- comment on scorecard load (handleCategoryChange triggers backfill).
--
-- Users don't write these texts by hand (they start with `[Market Visit — …]`
-- and are produced by POST /api/market-visits), so deleting them does not
-- drop user-authored content. A mis-attributed row was also never "real" data
-- — it pointed at the wrong retailer.

DELETE FROM comments
WHERE text ~ '^\[Market Visit — \d{4}-\d{2}-\d{2}';
