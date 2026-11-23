import { NextResponse } from 'next/server';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { features } from '../../../../../lib/features';
import { getLandingPath, getRoleFromUser } from '../../../../../lib/rbac';
import { getProof, readCookie, refreshSessionCookies } from '../../../../../lib/mfa/session';
import { decodeJwtPayload } from '../../../../../lib/mfa/proof';

// GET /api/auth/onboarding - The single source of truth for "what must this
// signed-in user do next": password | enroll | verify | done.
export async function GET(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request, { aal: 1 });
  } catch {
    return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });
  }

  const meta = user.app_metadata ?? {};
  let step: 'password' | 'enroll' | 'verify' | 'done' = 'done';
  if (meta.must_change_password === true) step = 'password';
  else if (features.ENABLE_2FA && meta.mfa_enrolled !== true) step = 'enroll';
  else if (features.ENABLE_2FA && !(await getProof(request, user))) step = 'verify';

  const res = NextResponse.json({ step, landing: getLandingPath(getRoleFromUser(user)) });

  // Middleware routes on the token's claims. If they lag behind the real
  // state (set moments ago, or a token minted before a migration), refresh now
  // so the next page load does not bounce.
  const claims = decodeJwtPayload(readCookie(request, 'supabase-access-token'))?.app_metadata ?? {};
  const stale =
    (claims.must_change_password === true) !== (meta.must_change_password === true) ||
    (claims.mfa_enrolled === true) !== (meta.mfa_enrolled === true) ||
    claims.role !== meta.role;
  if (stale) await refreshSessionCookies(request, res);

  return res;
}
