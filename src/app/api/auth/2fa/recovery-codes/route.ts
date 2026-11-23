import { NextResponse } from 'next/server';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { logger } from '../../../../../../lib/logger';
import { getProof } from '../../../../../../lib/mfa/session';
import { isFreshFactor } from '../../../../../../lib/mfa/proof';
import { logMfaEvent, replaceRecoveryCodes } from '../../../../../../lib/mfa/state';

// POST /api/auth/2fa/recovery-codes - Replace all recovery codes with a new set.
// Requires a second factor confirmed in the last 10 minutes.
export async function POST(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ error: '2FA is disabled.' }, { status: 400 });

  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });
  }

  if (!isFreshFactor(await getProof(request, user))) {
    return NextResponse.json(
      { error: 'Confirm a code from your authenticator first.', code: 'STEP_UP_REQUIRED' },
      { status: 403 },
    );
  }

  try {
    const recoveryCodes = await replaceRecoveryCodes(user.id);
    await logMfaEvent(user.id, 'recovery_codes_regenerated', request);
    return NextResponse.json({ recoveryCodes });
  } catch (err) {
    logger.error('recovery-codes: regenerate failed —', err);
    return NextResponse.json({ error: 'Could not generate recovery codes. Please try again.' }, { status: 500 });
  }
}
