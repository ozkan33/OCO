import crypto from 'crypto';

// ── TOTP secret encryption (AES-256-GCM) ────────────────────────────────────
// Uses TOTP_ENCRYPTION_KEY env var (32-byte hex string = 64 hex chars).
// Falls back to a derived key from JWT_SECRET if TOTP_ENCRYPTION_KEY is not set.

function getEncryptionKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (key && key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  // Derive a 32-byte key from JWT_SECRET — refuse to use a hardcoded fallback in production
  const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TOTP_ENCRYPTION_KEY or JWT_SECRET must be set in production');
    }
    // Only allow a dev-only fallback in non-production
    return crypto.createHash('sha256').update('dev-only-insecure-key').digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
  // If the stored value doesn't contain colons, it's a legacy plaintext secret
  if (!stored.includes(':')) return stored;

  const key = getEncryptionKey();
  const [ivHex, tagHex, encHex] = stored.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
}

// ── Trusted device token signing (HMAC-SHA256) ──────────────────────────────
// Signs device tokens so middleware can verify without a DB lookup.

function getSigningKey(): string {
  const key = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET or SUPABASE_JWT_SECRET must be set in production');
    }
    return 'dev-only-insecure-signing-key';
  }
  return key;
}

export function signDeviceToken(token: string): string {
  const sig = crypto.createHmac('sha256', getSigningKey()).update(token).digest('hex');
  return `${token}.${sig}`;
}

export function verifyDeviceToken(signedToken: string): boolean {
  const dotIndex = signedToken.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const token = signedToken.substring(0, dotIndex);
  const sig = signedToken.substring(dotIndex + 1);

  // Fail-soft: a missing JWT_SECRET in prod must not 500 the request — return false so the user
  // re-runs the 2FA prompt instead of seeing an internal error.
  let expected: string;
  try {
    expected = crypto.createHmac('sha256', getSigningKey()).update(token).digest('hex');
  } catch {
    return false;
  }

  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
