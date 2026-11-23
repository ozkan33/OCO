-- 2FA redesign. Apply AFTER 20261122_role_app_metadata_and_rls_hardening.sql
-- and BEFORE deploying the code that depends on it. Safe to re-run.

-- ── TOTP factor: pending enrollment, replay protection, lockout ─────────────
ALTER TABLE user_totp_secrets ALTER COLUMN encrypted_secret DROP NOT NULL;
ALTER TABLE user_totp_secrets ADD COLUMN IF NOT EXISTS pending_secret TEXT;
ALTER TABLE user_totp_secrets ADD COLUMN IF NOT EXISTS last_used_step BIGINT;
ALTER TABLE user_totp_secrets ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_totp_secrets ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Rows that were mid-enrollment held the unverified secret in encrypted_secret.
UPDATE user_totp_secrets
SET pending_secret = encrypted_secret, encrypted_secret = NULL
WHERE is_enabled = false AND encrypted_secret IS NOT NULL;

-- Atomic failure counter: every 5th failure locks, doubling from 15 minutes up to 24 hours.
CREATE OR REPLACE FUNCTION mfa_register_failure(p_user UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE user_totp_secrets
  SET failed_attempts = failed_attempts + 1,
      locked_until = CASE
        WHEN (failed_attempts + 1) % 5 = 0
          THEN now() + LEAST(interval '15 minutes' * power(2, (failed_attempts + 1) / 5 - 1)::float8, interval '24 hours')
        ELSE locked_until
      END
  WHERE user_id = p_user
  RETURNING locked_until;
$$;
REVOKE ALL ON FUNCTION mfa_register_failure(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mfa_register_failure(UUID) TO service_role;

-- ── Recovery codes (HMAC-hashed, single use) ────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user ON mfa_recovery_codes(user_id);
ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- ── Security event log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  detail JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_events_user ON mfa_events(user_id, created_at DESC);
ALTER TABLE mfa_events ENABLE ROW LEVEL SECURITY;

-- ── Trusted devices: store only a hash of the token, 90-day lifetime ────────
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE trusted_devices ALTER COLUMN device_token DROP NOT NULL;
UPDATE trusted_devices
SET token_hash = encode(sha256(convert_to(device_token, 'UTF8')), 'hex'),
    device_token = NULL,
    expires_at = trusted_at + interval '90 days'
WHERE token_hash IS NULL AND device_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_token_hash ON trusted_devices(token_hash);
ALTER TABLE trusted_devices ALTER COLUMN expires_at SET DEFAULT (now() + interval '90 days');

-- ── Revoke every session of one user (admin reset / deactivation) ───────────
CREATE OR REPLACE FUNCTION revoke_user_sessions(p_user UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  DELETE FROM auth.sessions WHERE user_id = p_user;
$$;
REVOKE ALL ON FUNCTION revoke_user_sessions(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION revoke_user_sessions(UUID) TO service_role;

-- ── Enrollment state moves to app_metadata (not user-writable) ──────────────
-- mfa_enrolled comes from the factor table, never from user_metadata.
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'mfa_enrolled', EXISTS (
    SELECT 1 FROM user_totp_secrets t
    WHERE t.user_id = u.id AND t.is_enabled AND t.encrypted_secret IS NOT NULL
  ),
  'must_change_password', COALESCE(
    (SELECT p.must_change_password FROM brand_user_profiles p WHERE p.id = u.id),
    false
  ),
  'mfa_epoch', COALESCE((u.raw_app_meta_data->>'mfa_epoch')::int, 0)
)
WHERE NOT (COALESCE(u.raw_app_meta_data, '{}'::jsonb) ? 'mfa_enrolled');
