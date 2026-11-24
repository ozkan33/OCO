import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { logger } from '../../../../lib/logger';
import { Capability, getRoleFromUser, hasCapability } from '../../../../lib/rbac';

// Built into the app (src/components/admin/constants.ts) — never stored.
const BUILT_IN = ['volkan', 'troy'];
const MAX_LABEL = 40;

async function requireAdmin(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!hasCapability(getRoleFromUser(user), Capability.ADMIN_FULL)) {
    return { error: NextResponse.json({ error: 'Only an Admin can change the 3B Contact list.' }, { status: 403 }) };
  }
  return { user };
}

// GET /api/contact-options - Extra "3B Contact" choices, for anyone who can
// open a scorecard. Managed on /admin/config.
//   ready     — false until the contact_options table exists
//   canManage — whether this user may add or remove choices
export async function GET(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = getRoleFromUser(user);
  if (!hasCapability(role, Capability.SCORECARD_READ) || !hasCapability(role, Capability.ADMIN_ACCESS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('contact_options')
    .select('label')
    .order('created_at', { ascending: true });
  if (error) {
    // Table not created yet, or a transient failure: the grid still works
    // with the built-in contacts.
    logger.warn('contact-options GET failed —', error.message);
  }

  return NextResponse.json({
    options: (data || []).map((r: { label: string }) => r.label),
    ready: !error,
    canManage: !error && hasCapability(role, Capability.ADMIN_FULL),
  });
}

// POST /api/contact-options - Add a choice. Admin only.
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';
  if (!label) {
    return NextResponse.json({ error: 'Enter a name.' }, { status: 400 });
  }
  if (label.length > MAX_LABEL) {
    return NextResponse.json({ error: `Keep the name under ${MAX_LABEL} characters.` }, { status: 400 });
  }
  if (BUILT_IN.includes(label.toLowerCase())) {
    return NextResponse.json({ error: `${label} is already in the list.` }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from('contact_options').insert({ label, created_by: auth.user.id });
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `${label} is already in the list.` }, { status: 409 });
    }
    logger.error('contact-options POST failed —', error.message);
    return NextResponse.json({ error: 'Could not add the contact. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ label }, { status: 201 });
}

// DELETE /api/contact-options?label=… - Remove a choice. Admin only.
// Cells already set to that name keep it; it just stops being offered.
export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const label = new URL(request.url).searchParams.get('label')?.trim();
  if (!label) {
    return NextResponse.json({ error: 'Missing name.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('contact_options').delete().eq('label', label);
  if (error) {
    logger.error('contact-options DELETE failed —', error.message);
    return NextResponse.json({ error: 'Could not remove the contact. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
