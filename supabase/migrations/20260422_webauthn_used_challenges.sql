-- Single-use challenge log for WebAuthn register/login ceremonies.
--
-- The signed cookie in lib/webauthn/challengeCookie.ts prevents tampering and
-- bounds TTL, but without a server-side consume step a captured cookie +
-- authenticator response can be replayed within the 5-minute window. Apple
-- platform authenticators (iPhone/iPad/Mac) always return counter=0, so the
-- counter-regression check cannot catch these replays either.
--
-- Verify routes INSERT the SHA-256 hash of the challenge here before issuing
-- a session. The UNIQUE primary key makes a second attempt with the same
-- challenge fail loudly (unique_violation / 23505), which the route treats
-- as a replay and rejects.
--
-- expires_at is set to the cookie's expiry so a lazy cleanup can prune rows
-- that can no longer match a live cookie.

CREATE TABLE IF NOT EXISTS public.webauthn_used_challenges (
  challenge_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_used_challenges_expires_idx
  ON public.webauthn_used_challenges(expires_at);

ALTER TABLE public.webauthn_used_challenges ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role (supabaseAdmin) ever writes here.
