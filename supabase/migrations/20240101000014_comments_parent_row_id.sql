-- Add parent_row_id to comments for subgrid comment support
-- When set, the comment belongs to a subgrid row (store) under the parent row (chain/customer)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_row_id TEXT;

-- Index for efficient subgrid comment lookups
CREATE INDEX IF NOT EXISTS idx_comments_parent_row_id ON comments (parent_row_id) WHERE parent_row_id IS NOT NULL;
