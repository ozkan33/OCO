-- Add recipient_user_id so notifications can target specific brand users
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user ON notifications(recipient_user_id, is_read, created_at DESC);

-- Brand users can view their own notifications
CREATE POLICY "Brand users can view own notifications"
  ON notifications FOR SELECT
  USING (recipient_user_id = auth.uid());

-- Brand users can mark their own notifications as read
CREATE POLICY "Brand users can update own notifications"
  ON notifications FOR UPDATE
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());
