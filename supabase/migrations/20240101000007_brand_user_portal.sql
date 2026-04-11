-- Brand user portal: profiles and scorecard assignments
-- Supports admin creating brand client users who can view their product status

-- Brand user profiles (extends auth.users with brand-specific data)
CREATE TABLE IF NOT EXISTS brand_user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login TIMESTAMPTZ
);

ALTER TABLE brand_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brand profile"
  ON brand_user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own brand profile last_login"
  ON brand_user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Brand user scorecard assignments (which scorecards a brand user can see)
CREATE TABLE IF NOT EXISTS brand_user_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  scorecard_id TEXT NOT NULL,
  product_columns TEXT[] NOT NULL DEFAULT '{}',
  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, scorecard_id)
);

ALTER TABLE brand_user_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assignments"
  ON brand_user_assignments FOR SELECT
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_brand_user_assignments_user_id ON brand_user_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_user_profiles_brand_name ON brand_user_profiles(brand_name);
