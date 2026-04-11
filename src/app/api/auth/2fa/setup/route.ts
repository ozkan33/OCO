import { NextResponse } from 'next/server';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';

// POST /api/auth/2fa/setup - Generate TOTP secret and QR code
export async function POST(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ enabled: false, skipped: true });
  try {
    const user = await getUserFromToken(request);

    // Generate secret
    const secret = generateSecret();
    const email = user.email || 'user';
    const otpauth = generateURI({ issuer: '3Brothers Marketing', label: email, secret });

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 256, margin: 2 });

    // Store the secret (not yet enabled — user must verify first)
    await supabaseAdmin
      .from('user_totp_secrets')
      .upsert({
        user_id: user.id,
        encrypted_secret: secret, // In production, encrypt this with a server key
        is_enabled: false,
        created_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    return NextResponse.json({
      qrCode: qrDataUrl,
      secret, // Show to user as manual entry backup
      message: 'Scan the QR code with your authenticator app, then verify with a code.',
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// GET /api/auth/2fa/setup - Check if 2FA is enabled for current user
export async function GET(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ enabled: false });
  try {
    const user = await getUserFromToken(request);

    const { data } = await supabaseAdmin
      .from('user_totp_secrets')
      .select('is_enabled, verified_at')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      enabled: data?.is_enabled || false,
      verifiedAt: data?.verified_at || null,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
