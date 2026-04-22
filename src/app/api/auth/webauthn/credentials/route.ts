import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { logger } from '../../../../../../lib/logger';

export async function GET(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('webauthn_credentials')
    .select('id, device_label, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('webauthn credentials list failed —', error.message);
    return NextResponse.json({ error: 'Could not load credentials' }, { status: 500 });
  }

  return NextResponse.json({ credentials: data ?? [] });
}

export async function DELETE(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let id = '';
  try {
    const body = await request.json();
    id = (body?.id ?? '').toString();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: 'Missing credential id' }, { status: 400 });

  // Always scope by user_id so an attacker who guesses an id can't delete
  // someone else's credential.
  const { error } = await supabaseAdmin
    .from('webauthn_credentials')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    logger.error('webauthn credentials delete failed —', error.message);
    return NextResponse.json({ error: 'Could not revoke' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
