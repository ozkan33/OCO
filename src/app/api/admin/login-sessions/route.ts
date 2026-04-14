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
    const role = url.searchParams.get('role');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const enriched = url.searchParams.get('enriched') === 'true';

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

    if (!enriched) return NextResponse.json(data || []);

    // Enrich sessions with user role and display name from auth
    const uniqueUserIds = [...new Set((data || []).map((s: any) => s.user_id))];
    const userMap: Record<string, { role: string; name: string }> = {};

    for (const uid of uniqueUserIds) {
      try {
        const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(uid as string);
        if (authUser) {
          userMap[uid as string] = {
            role: authUser.user_metadata?.role || 'UNKNOWN',
            name: authUser.user_metadata?.name || authUser.user_metadata?.display_name || authUser.email?.split('@')[0] || '',
          };
        }
      } catch { /* skip missing users */ }
    }

    let enrichedData = (data || []).map((s: any) => ({
      ...s,
      user_role: userMap[s.user_id]?.role || 'UNKNOWN',
      user_name: userMap[s.user_id]?.name || s.email?.split('@')[0] || '',
    }));

    // Filter by role if requested
    if (role) {
      enrichedData = enrichedData.filter((s: any) => s.user_role === role);
    }

    return NextResponse.json(enrichedData);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
