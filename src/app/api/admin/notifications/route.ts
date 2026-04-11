import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';
import { markNotificationsReadSchema } from '../../../../../lib/schemas';
import { z } from 'zod';

// GET /api/admin/notifications - Fetch notifications for admin
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = user.user_metadata?.role;

    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch recent notifications
    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('recipient_role', 'ADMIN')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Failed to fetch notifications:', error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    // Count unread
    const { count: unreadCount, error: countErr } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_role', 'ADMIN')
      .eq('is_read', false);

    if (countErr) {
      logger.error('Failed to count unread notifications:', countErr);
    }

    return NextResponse.json({
      notifications: notifications || [],
      unreadCount: unreadCount ?? 0,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// PATCH /api/admin/notifications - Mark notifications as read
export async function PATCH(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = user.user_metadata?.role;

    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = markNotificationsReadSchema.parse(body);

    if (parsed.markAllRead) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_role', 'ADMIN')
        .eq('is_read', false);

      if (error) {
        logger.error('Failed to mark all notifications read:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
      }

      return NextResponse.json({ updated: 'all' });
    }

    if (parsed.ids && parsed.ids.length > 0) {
      const { error } = await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .in('id', parsed.ids);

      if (error) {
        logger.error('Failed to mark notifications read:', error);
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
