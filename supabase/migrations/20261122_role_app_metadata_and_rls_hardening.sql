-- Role moves from raw_user_meta_data to raw_app_meta_data.
-- user_metadata is writable by the user themselves (PUT /auth/v1/user with the
-- public anon key), so a BRAND user could set role=ADMIN. app_metadata is
-- writable only with the service role.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT READS app_metadata.role, and
-- review the resulting ADMIN / KEY_ACCOUNT_MANAGER list afterwards: this copy
-- trusts whatever role is currently stored.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', upper(raw_user_meta_data->>'role'))
WHERE upper(raw_user_meta_data->>'role') IN ('ADMIN', 'BRAND', 'KEY_ACCOUNT_MANAGER', 'FIELD_SALES_REP')
  AND NOT (COALESCE(raw_app_meta_data, '{}'::jsonb) ? 'role');

-- Notification policies keyed admin access on the user-writable role.
DROP POLICY IF EXISTS "Admins can view notifications" ON notifications;
CREATE POLICY "Admins can view notifications"
  ON notifications FOR SELECT
  USING (
    recipient_role = 'ADMIN'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN'
  );

DROP POLICY IF EXISTS "Admins can update notifications" ON notifications;
CREATE POLICY "Admins can update notifications"
  ON notifications FOR UPDATE
  USING (
    recipient_role = 'ADMIN'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN'
  )
  WITH CHECK (
    recipient_role = 'ADMIN'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'ADMIN'
  );

-- This policy had no TO clause, so it granted anon/authenticated full write
-- access to landing-page logos. The service role bypasses RLS and needs no policy.
DROP POLICY IF EXISTS "Service role can manage client logos" ON client_logos;

-- This policy let a brand user rewrite any column of their own profile row,
-- including brand_name (which scopes weekly summaries and market visits).
-- last_login is written server-side with the service role.
DROP POLICY IF EXISTS "Users can update own brand profile last_login" ON brand_user_profiles;
