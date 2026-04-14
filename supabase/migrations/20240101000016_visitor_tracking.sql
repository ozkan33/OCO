-- Visitor tracking for site analytics
CREATE TABLE IF NOT EXISTS site_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Visit info
  page_url TEXT NOT NULL,
  referrer TEXT,
  -- Visitor info
  ip_address TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  -- Device info
  user_agent TEXT,
  device_type TEXT, -- 'desktop', 'mobile', 'tablet'
  browser TEXT,
  os TEXT,
  -- UTM tracking
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  -- Session
  session_id TEXT,
  is_unique BOOLEAN DEFAULT true,
  -- Timestamps
  visited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_site_visitors_visited_at ON site_visitors (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visitors_page_url ON site_visitors (page_url);
CREATE INDEX IF NOT EXISTS idx_site_visitors_referrer ON site_visitors (referrer);

-- RLS: only admins can read, API writes with service role
ALTER TABLE site_visitors ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (API routes use supabaseAdmin)
-- No user-level policies needed since all access goes through API routes
