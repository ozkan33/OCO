-- Notifications table for brand portal user activity alerts
-- Admins see notifications when brand users add comments/notes

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_role TEXT NOT NULL DEFAULT 'ADMIN',
  actor_user_id UUID REFERENCES auth.users(id),
  actor_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  scorecard_id UUID REFERENCES user_scorecards(id) ON DELETE CASCADE,
  scorecard_name TEXT,
  row_id TEXT,
  row_name TEXT,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_role, is_read, created_at DESC);
CREATE INDEX idx_notifications_scorecard ON notifications(scorecard_id);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Admin users can read all notifications
CREATE POLICY "Admins can view notifications"
  ON notifications FOR SELECT
  USING (
    recipient_role = 'ADMIN'
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'ADMIN'
    )
  );

-- Admin users can update notifications (mark as read)
CREATE POLICY "Admins can update notifications"
  ON notifications FOR UPDATE
  USING (
    recipient_role = 'ADMIN'
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'ADMIN'
    )
  )
  WITH CHECK (
    recipient_role = 'ADMIN'
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'ADMIN'
    )
  );

-- Service role can insert (API routes use supabaseAdmin)
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);
