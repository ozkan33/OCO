-- Add a must_enroll_2fa flag for brand users.
--
-- Why: previously the 2FA-enforcement gate in middleware keyed on
--   user_metadata.totp_enabled. A brand user whose first-login flow failed to
--   enroll 2FA (e.g. TOTP_ENCRYPTION_KEY misconfigured on prod, /api/auth/2fa/setup
--   returning 500) would have totp_enabled = false AND must_change_password = false
--   once their password commit succeeded, so the gate let them straight into /portal
--   with no second factor.
--
-- Fix: a dedicated must_enroll_2fa flag, set at brand-user creation and cleared
-- ONLY when verify succeeds. Middleware treats it as a hard redirect to
-- /auth/change-password, which is where the enrollment flow lives. Additive:
-- existing rows default to false (matching current "not required" behavior); the
-- brand-users POST handler sets it to true for all new creations when 2FA is on.

ALTER TABLE brand_user_profiles
  ADD COLUMN IF NOT EXISTS must_enroll_2fa BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any existing brand user who doesn't have 2FA enabled and isn't
-- already being forced through change-password should be flagged for enrollment.
-- Users already enrolled (totp_enabled = true) stay untouched. Users still in the
-- middle of the change-password flow (must_change_password = true) also stay
-- untouched — they'll pick up must_enroll_2fa after they finish that step.
UPDATE brand_user_profiles
SET must_enroll_2fa = true
WHERE totp_enabled = false
  AND must_change_password = false;
