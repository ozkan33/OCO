-- Make comments.user_id → auth.users(id) cascade on delete.
--
-- Currently the FK has no ON DELETE action (= NO ACTION), so deleting an
-- auth.users row blocks with "Database error deleting user" whenever that
-- user has any comments. The brand-user delete API silently swallowed this,
-- leaving orphaned auth rows whose emails appeared "already registered"
-- to admins trying to recreate the same client. We patched the route to
-- pre-delete comments, but this is a belt-and-suspenders DB-level fix so
-- the same footgun doesn't bite any future code path (tests, scripts,
-- Studio "delete user" button, etc.).

ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS comments_user_id_fkey;

ALTER TABLE comments
  ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
