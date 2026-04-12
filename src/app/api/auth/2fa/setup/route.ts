import { NextResponse } from 'next/server';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { features } from '../../../../../../lib/features';
import { encryptSecret } from '../../../../../../lib/crypto';

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

    // Store the secret encrypted at rest
    await supabaseAdmin
      .from('user_totp_secrets')
      .upsert({
        user_id: user.id,
        encrypted_secret: encryptSecret(secret),
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

// DELETE /api/auth/2fa/setup - Disable 2FA for current user (requires password)
export async function DELETE(request: Request) {
  if (!features.ENABLE_2FA) return NextResponse.json({ enabled: false });
  try {
    const user = await getUserFromToken(request);

    // Require password verification before disabling 2FA
    const { password } = await request.json().catch(() => ({ password: null }));
    if (!password) {
      return NextResponse.json({ error: 'Password is required to disable 2FA' }, { status: 400 });
    }

    // Verify the password using Supabase auth
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password,
    });
    if (authError) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }

    // Remove TOTP secret
    await supabaseAdmin
      .from('user_totp_secrets')
      .delete()
      .eq('user_id', user.id);

    // Remove trusted devices
    await supabaseAdmin
      .from('trusted_devices')
      .delete()
      .eq('user_id', user.id);

    // Update user metadata
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, totp_enabled: false },
    });

    // Update brand_user_profiles if exists
    await supabaseAdmin
      .from('brand_user_profiles')
      .update({ totp_enabled: false })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true, enabled: false });
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
