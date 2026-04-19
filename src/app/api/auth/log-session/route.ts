import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { features } from '../../../../../lib/features';

// POST /api/auth/log-session - Record login/logout for tracking
export async function POST(request: Request) {
  if (!features.ENABLE_LOGIN_TRACKING) return NextResponse.json({ success: true, skipped: true });
  try {
    const user = await getUserFromToken(request);
    const { action } = await request.json();
    const ua = request.headers.get('user-agent') || '';
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const hasTrustedCookie = (request.headers.get('cookie') || '').includes('trusted_device=');

    // Skip localhost/dev sessions so the admin Activity dashboard only reflects real user traffic.
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'unknown') {
      return NextResponse.json({ success: true, skipped: true });
    }

    if (action === 'login') {
      await supabaseAdmin.from('login_sessions').insert({
        user_id: user.id,
        email: user.email || '',
        brand_name: user.user_metadata?.brand || null,
        ip_address: ip,
        user_agent: ua.substring(0, 500),
        device_trusted: hasTrustedCookie,
        two_factor_used: !!user.user_metadata?.totp_enabled,
      });
    } else if (action === 'logout') {
      // Update the most recent session for this user with logout time
      const { data: sessions } = await supabaseAdmin
        .from('login_sessions')
        .select('id')
        .eq('user_id', user.id)
        .is('logout_at', null)
        .order('login_at', { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        await supabaseAdmin
          .from('login_sessions')
          .update({ logout_at: new Date().toISOString() })
          .eq('id', sessions[0].id);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
