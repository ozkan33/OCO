-- This policy had no TO clause, so anyone holding the public anon key could
-- insert forged notifications for admins or brand users. Every legitimate
-- insert goes through the service role, which bypasses RLS and needs no policy.
DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;
