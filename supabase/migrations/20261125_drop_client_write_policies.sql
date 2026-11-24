-- Every write to these tables goes through API routes using the service role,
-- which bypasses RLS. These policies were added "for safety if client-side
-- access is ever added", but they let ANY signed-in user (including a brand
-- client) write straight to the database with the public anon key, skipping
-- every check in the API:
--   • insert a scorecard owned by themselves — it then appears in the shared
--     admin pool, the master scorecard and the brand list;
--   • insert a comment on ANY scorecard_id (the check is only user_id = self);
--   • insert a market visit tagged with any brand, shown to that brand's clients.
-- SELECT policies are kept: realtime scorecard updates depend on them.
DROP POLICY IF EXISTS "Users can insert own scorecards" ON user_scorecards;
DROP POLICY IF EXISTS "Users can update own scorecards" ON user_scorecards;
DROP POLICY IF EXISTS "Users can delete own scorecards" ON user_scorecards;

DROP POLICY IF EXISTS "Users can insert own comments" ON comments;
DROP POLICY IF EXISTS "Users can update own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;

DROP POLICY IF EXISTS "Users can insert own visits" ON market_visits;
DROP POLICY IF EXISTS "Users can update own visits" ON market_visits;
DROP POLICY IF EXISTS "Users can delete own visits" ON market_visits;
