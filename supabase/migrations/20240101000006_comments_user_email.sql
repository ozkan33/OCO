-- Add user_email column to comments table for displaying author names
-- without requiring a join to auth.users
ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_email text DEFAULT '';
