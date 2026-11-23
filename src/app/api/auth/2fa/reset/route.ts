import { NextResponse } from 'next/server';

// POST /api/auth/2fa/reset - Retired. A password alone must never remove the
// second factor. Recovery is a one-time recovery code (/api/auth/2fa/recovery)
// or an administrator reset (/api/admin/brand-users/[id]/reset-2fa).
export async function POST() {
  return NextResponse.json(
    { error: 'Self-service 2FA reset is no longer available. Use a recovery code, or ask your administrator to reset your 2FA.' },
    { status: 410 },
  );
}
