import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../../lib/apiAuth';
import { revokeUserAccess } from '../../../../../../../lib/mfa/state';

// POST /api/admin/brand-users/[id]/reset-password - Admin resets a brand user's password
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getUserFromToken(request);
    if (admin.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { newPassword } = await request.json();

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const { data: { user: target }, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(id);
    if (fetchError || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: newPassword,
      app_metadata: { must_change_password: true },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Whoever knew the old password is signed out everywhere.
    await revokeUserAccess(id);

    // Update profile
    await supabaseAdmin
      .from('brand_user_profiles')
      .update({ must_change_password: true })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
