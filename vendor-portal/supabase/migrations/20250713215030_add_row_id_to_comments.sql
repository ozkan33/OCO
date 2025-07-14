-- Add missing row_id column to comments table
-- This migration adds the row_id column that is required for the comments functionality

-- First, add the column with a default value to handle existing records
ALTER TABLE comments 
ADD COLUMN IF NOT EXISTS row_id TEXT NOT NULL DEFAULT '1';

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_comments_row_id ON comments(row_id);

-- Remove the default value (we only needed it for the NOT NULL constraint)
ALTER TABLE comments ALTER COLUMN row_id DROP DEFAULT;
