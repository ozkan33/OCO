import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';
import { markNotificationsReadSchema } from '../../../../../lib/schemas';
import { z } from 'zod';

// GET /api/portal/notifications - Fetch notifications for brand user
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = user.user_metadata?.role;

    if (role !== 'BRAND') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
  try {
    const user = await getUserFromToken(request);
    const role = user.user_metadata?.role;

    if (role !== 'BRAND') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    return NextResponse.json({ updated: 0 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
