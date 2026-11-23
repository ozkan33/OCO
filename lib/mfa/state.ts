import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin';
import { logger } from '../logger';

export const TRUSTED_DEVICE_DAYS = 90;
export const TRUSTED_DEVICE_TTL_S = TRUSTED_DEVICE_DAYS * 24 * 60 * 60;
const RECOVERY_CODE_COUNT = 10;
// No 0/O/1/I/L — codes get read off paper and typed on phones.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function pepper(): string {
  const s = process.env.MFA_PROOF_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('MFA_PROOF_SECRET (or JWT_SECRET) must be set in production');
  return 'dev-only-insecure-signing-key';
}

export function hashDeviceToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashRecoveryCode(userId: string, code: string): string {
  return crypto.createHmac('sha256', pepper()).update(`recovery:${userId}:${normalizeRecoveryCode(code)}`).digest('hex');
}

// app_metadata is merged key-by-key by the admin API, so a partial patch is safe.
export async function setAppMetadata(userId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: patch });
  if (error) throw new Error(`app_metadata update failed: ${error.message}`);
}

export async function logMfaEvent(
  userId: string | null,
  event: string,
  request?: Request | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from('mfa_events').insert({
      user_id: userId,
      event,
      detail: detail ?? null,
      ip_address: request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request?.headers.get('x-real-ip') || null,
      user_agent: request?.headers.get('user-agent')?.substring(0, 500) || null,
    });
  } catch (err) {
    logger.warn('mfa event log failed —', err instanceof Error ? err.message : err);
  }
}

// ── Lockout ──────────────────────────────────────────────────────────────────

export function lockedForSeconds(lockedUntil: string | null | undefined): number {
  if (!lockedUntil) return 0;
  return Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000));
}

export function lockMessage(seconds: number): string {
  const mins = Math.ceil(seconds / 60);
  return `Too many incorrect codes. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`;
}

// Returns the seconds the user is now locked for (0 if not locked).
export async function registerFailure(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('mfa_register_failure', { p_user: userId });
  if (error) {
    logger.error('mfa_register_failure failed —', error.message);
    return 0;
  }
  return lockedForSeconds(data as string | null);
}

export async function clearFailures(userId: string): Promise<void> {
  await supabaseAdmin.from('user_totp_secrets').update({ failed_attempts: 0, locked_until: null }).eq('user_id', userId);
}

// ── Recovery codes ───────────────────────────────────────────────────────────

export async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    let raw = '';
    for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  await supabaseAdmin.from('mfa_recovery_codes').delete().eq('user_id', userId);
  const { error } = await supabaseAdmin
    .from('mfa_recovery_codes')
    .insert(codes.map(code => ({ user_id: userId, code_hash: hashRecoveryCode(userId, code) })));
  if (error) throw new Error(`recovery code insert failed: ${error.message}`);
  return codes;
}

// Single-use: the conditional update is the atomic claim.
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  if (normalizeRecoveryCode(code).length !== 10) return false;
  const { data, error } = await supabaseAdmin
    .from('mfa_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('code_hash', hashRecoveryCode(userId, code))
    .is('used_at', null)
    .select('id');
  return !error && !!data && data.length > 0;
}

export async function recoveryCodesRemaining(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('mfa_recovery_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null);
  return count ?? 0;
}

// ── Revocation ───────────────────────────────────────────────────────────────

// Bumping the epoch invalidates every MFA proof the user holds, immediately,
// on every API route. Session deletion is best-effort on top of that.
export async function revokeUserAccess(userId: string): Promise<void> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const current = Number(data?.user?.app_metadata?.mfa_epoch ?? 0) || 0;
  await setAppMetadata(userId, { mfa_epoch: current + 1 });
  const { error } = await supabaseAdmin.rpc('revoke_user_sessions', { p_user: userId });
  if (error) logger.warn('revoke_user_sessions failed —', error.message);
}

// Wipes the user's second factor so they must enroll again at next sign-in.
export async function resetUserMfa(userId: string): Promise<void> {
  await supabaseAdmin.from('user_totp_secrets').delete().eq('user_id', userId);
  await supabaseAdmin.from('mfa_recovery_codes').delete().eq('user_id', userId);
  await supabaseAdmin.from('trusted_devices').delete().eq('user_id', userId);
  // A passkey is a complete sign-in on its own and may live on the lost device.
  await supabaseAdmin.from('webauthn_credentials').delete().eq('user_id', userId);
  await supabaseAdmin.from('brand_user_profiles').update({ totp_enabled: false, must_enroll_2fa: true }).eq('id', userId);
  await setAppMetadata(userId, { mfa_enrolled: false });
  await revokeUserAccess(userId);
}
