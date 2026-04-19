import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';

// GET /api/admin/activity — server-side aggregation for the User Activity
// dashboard. Single RPC call replaces the old 500-row fetch + JS aggregation
// (which silently undercounted once traffic exceeded the cap) and the N+1
// auth.admin.getUserById enrichment loop.
export async function GET(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.user_metadata?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const days  = Math.max(1, Math.min(parseInt(url.searchParams.get('days')  || '30',  10) || 30,  365));
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500));
    const rawRole = url.searchParams.get('role');
    const role = rawRole && ['ADMIN', 'BRAND'].includes(rawRole) ? rawRole : null;

    const { data, error } = await supabaseAdmin.rpc('get_activity_analytics', {
      days_back:    days,
      result_limit: limit,
      role_filter:  role,
    });

    if (error) {
      logger.error('Activity analytics RPC failed:', error);
      return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
    }

    return NextResponse.json(data || {});
  } catch (err) {
    logger.error('Activity analytics failed:', err);
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
  }
}
