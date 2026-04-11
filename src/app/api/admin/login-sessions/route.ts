import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

// GET /api/admin/login-sessions - Get all login sessions (admin only)
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    let query = supabaseAdmin
      .from('login_sessions')
      .select('*')
      .order('login_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
