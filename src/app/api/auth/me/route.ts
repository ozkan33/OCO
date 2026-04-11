import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get('Cookie') ?? '';
    const accessToken = cookieHeader.match(/supabase-access-token=([^;]+)/)?.[1] ?? null;

    if (!accessToken) {
      return NextResponse.json({ error: 'No authentication token found' }, { status: 401 });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Role is stored in Supabase user_metadata when the user is created.
    // Default to 'VENDOR' — never assume ADMIN.
    const role = (user.user_metadata?.role as string | undefined)?.toUpperCase() ?? 'VENDOR';

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name ?? user.email,
        role,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
