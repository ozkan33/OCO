import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { logger } from '../../../../../lib/logger';
import { markNotificationsReadSchema } from '../../../../../lib/schemas';
import { Capability } from '../../../../../lib/rbac';
import { authorize } from '../../../../../lib/rbac/requireCapability';
import { z } from 'zod';

// GET /api/portal/notifications - Fetch notifications for the current portal user
export async function GET(request: Request) {
  const auth = await authorize(request, Capability.PORTAL_ACCESS);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {

    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('recipient_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Failed to fetch portal notifications:', error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    const { count: unreadCount, error: countErr } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', user.id)
      .eq('is_read', false);

    if (countErr) {
      logger.error('Failed to count unread portal notifications:', countErr);
    }

    return NextResponse.json({
      notifications: notifications || [],
      unreadCount: unreadCount ?? 0,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// PATCH /api/portal/notifications - Mark notifications as read
export async function PATCH(request: Request) {
  const auth = await authorize(request, Capability.PORTAL_ACCESS);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {

    const body = await request.json();
    const parsed = markNotificationsReadSchema.parse(body);

    if (parsed.markAllRead) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_user_id', user.id)
        .eq('is_read', false);

      if (error) {
        logger.error('Failed to mark all portal notifications read:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
      }

      return NextResponse.json({ updated: 'all' });
    }

    if (parsed.ids && parsed.ids.length > 0) {
      // Only mark notifications that belong to this user
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_user_id', user.id)
        .in('id', parsed.ids);

      if (error) {
        logger.error('Failed to mark portal notifications read:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
      }

      return NextResponse.json({ updated: parsed.ids.length });
    }

    if (parsed.scorecardId && parsed.rowId) {
      // Row-scoped mark-as-read: used when brand user opens a row's comment
      // drawer, so all admin-authored notifications for that row clear at once.
      const { error, count } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true }, { count: 'exact' })
        .eq('recipient_user_id', user.id)
        .eq('scorecard_id', parsed.scorecardId)
        .eq('row_id', parsed.rowId)
        .eq('is_read', false);

      if (error) {
        logger.error('Failed to mark portal notifications read for row:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
      }

      return NextResponse.json({ updated: count ?? 0 });
    }

    return NextResponse.json({ updated: 0 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
