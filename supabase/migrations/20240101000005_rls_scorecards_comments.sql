-- Add RLS policies for user_scorecards and comments tables
-- Defense-in-depth: API routes use supabaseAdmin (service role), but RLS
-- protects against accidental client-side direct queries.

-- user_scorecards
ALTER TABLE user_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scorecards"
  ON user_scorecards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scorecards"
  ON user_scorecards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scorecards"
  ON user_scorecards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own scorecards"
  ON user_scorecards FOR DELETE
  USING (auth.uid() = user_id);

-- comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own comments"
  ON comments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (auth.uid() = user_id);
