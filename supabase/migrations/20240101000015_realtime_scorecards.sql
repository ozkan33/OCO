-- Enable realtime on user_scorecards for multi-tab sync
-- Supabase Realtime requires the table to be added to the supabase_realtime publication
-- and needs REPLICA IDENTITY FULL to send the full row on UPDATE events.

ALTER TABLE user_scorecards REPLICA IDENTITY FULL;

-- Add to Supabase realtime publication (creates if not exists)
DO $$
BEGIN
  -- Check if publication exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Add table to existing publication (ignore if already added)
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE user_scorecards;
    EXCEPTION WHEN duplicate_object THEN
      -- Already added, no-op
      NULL;
    END;
  END IF;
END $$;
