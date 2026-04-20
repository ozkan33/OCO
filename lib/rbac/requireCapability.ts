import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getUserFromToken } from '../apiAuth';
import { getRoleFromUser, hasCapability } from './check';
import type { Role } from './roles';
import type { Capability } from './capabilities';

export type AuthorizedContext = { user: User; role: Role };

type Result =
  | { ok: true; user: User; role: Role }
  | { ok: false; response: NextResponse };

export async function authorize(request: Request, capability: Capability): Promise<Result> {
  let user: User;
  try {
    user = await getUserFromToken(request);
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const role = getRoleFromUser(user);
  if (!role || !hasCapability(role, capability)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, user, role };
}
