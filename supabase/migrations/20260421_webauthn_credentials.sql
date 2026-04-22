-- WebAuthn / passkey credentials for biometric login (Face ID / Touch ID / Windows Hello).
-- Writes happen exclusively via the service role; no client RLS policies are granted.
--
-- credential_id and public_key are stored as base64url TEXT rather than BYTEA
-- because PostgREST returns bytea as escaped hex strings which are awkward to
-- round-trip. SimpleWebAuthn already uses base64url for credential IDs natively,
-- so this is a zero-conversion representation on the happy path.

CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx
  ON public.webauthn_credentials(user_id);

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- No policies: all reads/writes go through supabaseAdmin (service role) which
-- bypasses RLS. Anon/authenticated keys cannot access this table directly.
