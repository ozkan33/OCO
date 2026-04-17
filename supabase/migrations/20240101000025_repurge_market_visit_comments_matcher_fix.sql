-- Re-purge auto-generated market-visit comments after the matcher was tightened
-- (lib/marketVisitMatcher.ts + src/app/api/market-visits/*). The previous rules
-- allowed a weak single-token subgrid hit on one chain to beat an exact chain
-- match on another — e.g. "Kowalski's Woodbury" visits landed on the
-- Lunds&Byerlys chain row because an L&B subgrid row shared the "Woodbury"
-- token. Next scorecard load re-runs the backfill with the corrected logic and
-- re-synthesizes these comments on the correct rows from `market_visits`.

DELETE FROM comments
WHERE text ~ '^\[Market Visit — \d{4}-\d{2}-\d{2}';
