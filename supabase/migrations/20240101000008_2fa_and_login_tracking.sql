-- 2FA TOTP secrets (encrypted server-side, stored per user)
CREATE TABLE IF NOT EXISTS user_totp_secrets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);

ALTER TABLE user_totp_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own totp status"
  ON user_totp_secrets FOR SELECT
  USING (auth.uid() = user_id);

-- Trusted devices (skip 2FA on recognized devices)
CREATE TABLE IF NOT EXISTS trusted_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL DEFAULT 'Unknown Device',
  user_agent TEXT,
  ip_address TEXT,
  trusted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trusted devices"
  ON trusted_devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_token ON trusted_devices(device_token);

-- Login sessions tracking (for admin audit)
CREATE TABLE IF NOT EXISTS login_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  brand_name TEXT,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN logout_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (logout_at - login_at)) / 60
      ELSE NULL
    END
  ) STORED,
  ip_address TEXT,
  user_agent TEXT,
  device_trusted BOOLEAN DEFAULT false,
  two_factor_used BOOLEAN DEFAULT false
);

ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;

-- Only admin (via supabaseAdmin) can read all sessions
-- Users can see their own
CREATE POLICY "Users can view own sessions"
  ON login_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_login_sessions_user ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_login_at ON login_sessions(login_at DESC);

-- Add 2fa_enabled flag to brand_user_profiles
ALTER TABLE brand_user_profiles ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
