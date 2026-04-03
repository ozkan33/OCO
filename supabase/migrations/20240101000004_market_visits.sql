-- Market visit photos: admin uploads shelf photos from store visits
CREATE TABLE IF NOT EXISTS market_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  photo_url TEXT NOT NULL,
  photo_storage_path TEXT NOT NULL,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  store_name TEXT,
  note TEXT,
  brands TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_market_visits_user ON market_visits(user_id);
CREATE INDEX idx_market_visits_date ON market_visits(visit_date DESC);
CREATE INDEX idx_market_visits_brands ON market_visits USING GIN(brands);

ALTER TABLE market_visits ENABLE ROW LEVEL SECURITY;

-- RLS policies (API routes use supabaseAdmin which bypasses RLS,
-- but these are here for safety if client-side access is ever added)
CREATE POLICY "Users can view own visits"
  ON market_visits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own visits"
  ON market_visits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own visits"
  ON market_visits FOR DELETE
  USING (auth.uid() = user_id);
