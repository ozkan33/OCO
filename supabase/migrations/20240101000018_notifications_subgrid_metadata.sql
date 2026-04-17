-- Add subgrid context to notifications so a click can jump directly to the
-- correct subgrid store and open its comment drawer.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS parent_row_id TEXT;
