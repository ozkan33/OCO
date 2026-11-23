import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../../lib/apiAuth';
import { logger } from '../../../../../../../lib/logger';
import { logMfaEvent, resetUserMfa } from '../../../../../../../lib/mfa/state';

// POST /api/admin/brand-users/[id]/reset-2fa - Admin clears a user's second
// factor (lost phone, no recovery codes). The user is signed out everywhere
// and must enroll a new authenticator at next sign-in.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (admin.user_metadata?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { data: target, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(id);
  if (fetchError || !target?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  try {
    await resetUserMfa(id);
    await logMfaEvent(id, 'admin_reset', request, { by: admin.id });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('reset-2fa: failed —', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not reset 2FA. Please try again.' }, { status: 500 });
  }
}
