import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { logger } from '../../../../../../lib/logger';
import { getSessionId, issueProof } from '../../../../../../lib/mfa/session';
import {
  clearFailures, consumeRecoveryCode, lockMessage, lockedForSeconds, logMfaEvent,
  recoveryCodesRemaining, registerFailure,
} from '../../../../../../lib/mfa/state';

// POST /api/auth/2fa/recovery - Sign in with a one-time recovery code when the
// authenticator is unavailable. The proof it issues counts as a fresh factor,
// so the user can immediately set up a new authenticator.
export async function POST(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ success: true, skipped: true });

  let user;
  try {
    user = await getUserFromToken(request, { aal: 1 });
  } catch {
    return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });
  }

  try {
    const { code } = await request.json().catch(() => ({ code: null }));
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Enter a recovery code.' }, { status: 400 });
    }

    // Recovery attempts share the authenticator's lockout counter.
    const { data: row } = await supabaseAdmin
      .from('user_totp_secrets')
      .select('is_enabled, locked_until')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!row?.is_enabled) {
      return NextResponse.json({ error: '2FA is not set up for this account.' }, { status: 400 });
    }

    const lockedFor = lockedForSeconds(row.locked_until);
    if (lockedFor > 0) {
      return NextResponse.json({ error: lockMessage(lockedFor), code: 'LOCKED' }, { status: 429 });
    }

    if (!(await consumeRecoveryCode(user.id, code))) {
      const nowLocked = await registerFailure(user.id);
      await logMfaEvent(user.id, nowLocked > 0 ? 'recovery_locked' : 'recovery_failed', request);
      return nowLocked > 0
        ? NextResponse.json({ error: lockMessage(nowLocked), code: 'LOCKED' }, { status: 429 })
        : NextResponse.json({ error: 'That recovery code is not valid or was already used.' }, { status: 400 });
    }

    await clearFailures(user.id);
    await logMfaEvent(user.id, 'recovery_code_used', request);

    const res = NextResponse.json({ success: true, remaining: await recoveryCodesRemaining(user.id) });
    await issueProof(res, user, getSessionId(request), 'recovery');
    return res;
  } catch (err) {
    logger.error('2FA recovery: unexpected error —', err);
    return NextResponse.json({ error: 'Could not verify the recovery code. Please try again.' }, { status: 500 });
  }
}
