-- Supabase schema for user scorecards and auto-save functionality

-- User scorecards table
CREATE TABLE IF NOT EXISTS user_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id INTEGER, -- Reference to existing vendor table
  title TEXT NOT NULL DEFAULT 'Untitled Scorecard',
  data JSONB NOT NULL DEFAULT '{}',
  last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  is_draft BOOLEAN DEFAULT true
);

-- Scorecard history for version control
CREATE TABLE IF NOT EXISTS scorecard_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id UUID REFERENCES user_scorecards(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  change_summary TEXT
);

-- Auto-save sessions for tracking unsaved changes
CREATE TABLE IF NOT EXISTS auto_save_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scorecard_id UUID REFERENCES user_scorecards(id) ON DELETE CASCADE,
  temp_data JSONB NOT NULL,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Comments table for scorecard rows
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id UUID REFERENCES user_scorecards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  row_id TEXT NOT NULL, -- Store the row ID as text since it can be string or number
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_scorecards_user_id ON user_scorecards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_scorecards_vendor_id ON user_scorecards(vendor_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_history_scorecard_id ON scorecard_history(scorecard_id);
CREATE INDEX IF NOT EXISTS idx_auto_save_sessions_user_id ON auto_save_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_save_sessions_expires_at ON auto_save_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_comments_scorecard_id ON comments(scorecard_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_row_id ON comments(row_id);

-- RLS (Row Level Security) policies
ALTER TABLE user_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_save_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Policies for user_scorecards
CREATE POLICY "Users can view their own scorecards" ON user_scorecards
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scorecards" ON user_scorecards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scorecards" ON user_scorecards
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scorecards" ON user_scorecards
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for scorecard_history
CREATE POLICY "Users can view their scorecard history" ON scorecard_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_scorecards 
      WHERE id = scorecard_history.scorecard_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their scorecard history" ON scorecard_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_scorecards 
      WHERE id = scorecard_history.scorecard_id 
      AND user_id = auth.uid()
    )
  );

-- Policies for auto_save_sessions
CREATE POLICY "Users can manage their auto-save sessions" ON auto_save_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Policies for comments
CREATE POLICY "Users can view comments on their scorecards" ON comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_scorecards 
      WHERE user_scorecards.id = comments.scorecard_id 
      AND user_scorecards.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create comments on their scorecards" ON comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM user_scorecards 
      WHERE user_scorecards.id = comments.scorecard_id 
      AND user_scorecards.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own comments" ON comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" ON comments
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update last_modified timestamp
CREATE OR REPLACE FUNCTION update_last_modified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update last_modified
CREATE TRIGGER update_user_scorecards_last_modified
  BEFORE UPDATE ON user_scorecards
  FOR EACH ROW
  EXECUTE FUNCTION update_last_modified();

-- Function to clean up expired auto-save sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM auto_save_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to create version history when scorecard is saved
CREATE OR REPLACE FUNCTION create_scorecard_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.data IS DISTINCT FROM NEW.data THEN
    INSERT INTO scorecard_history (scorecard_id, data, version, change_summary)
    VALUES (NEW.id, NEW.data, NEW.version, 'Auto-save update');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create version history
CREATE TRIGGER create_scorecard_version_trigger
  AFTER UPDATE ON user_scorecards
  FOR EACH ROW
  EXECUTE FUNCTION create_scorecard_version(); 