// Shared server-side auth helper.
// Replaces the copy-pasted getUserFromToken in every route file.

import { supabaseAdmin } from './supabaseAdmin';
import { logger } from './logger';
import { getRoleFromUser } from './rbac/check';
import { features } from './features';
import { getProof } from './mfa/session';

export class MfaRequiredError extends Error {
  constructor() { super('MFA required'); }
}

// aal 2 (the default) = password plus a verified second factor, with no
// pending forced password change. aal 1 = password only; reserved for the
// sign-in, enrollment and onboarding endpoints that have to work before the
// second factor exists.
export async function getUserFromToken(request: Request, opts: { aal?: 1 | 2 } = {}) {
  const cookieHeader = request.headers.get('Cookie') ?? request.headers.get('cookie') ?? '';
  const token = cookieHeader.match(/supabase-access-token=([^;]+)/)?.[1] ?? null;

  if (!token) throw new Error('No token found');

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    logger.warn('Token verification failed:', error?.message);
    throw new Error('Invalid token');
  }

  // Many routes compare user.user_metadata.role directly. user_metadata is
  // user-writable, so overwrite that field with the trusted app_metadata role
  // (or nothing) before any route sees it.
  user.user_metadata = { ...user.user_metadata, role: getRoleFromUser(user) ?? undefined };

  if ((opts.aal ?? 2) === 2) {
    if (user.app_metadata?.must_change_password === true) throw new MfaRequiredError();
    if (features.ENABLE_2FA && !(await getProof(request, user))) throw new MfaRequiredError();
  }

  return user;
}
