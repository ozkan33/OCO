import crypto from 'crypto';

// ── TOTP secret encryption (AES-256-GCM) ────────────────────────────────────
//
// Storage format:
//   v1:<iv-hex>:<tag-hex>:<enc-hex>    ← new (versioned)
//   <iv-hex>:<tag-hex>:<enc-hex>       ← legacy (pre-versioning)
//   <plaintext>                         ← legacy (pre-encryption, no colons)
//
// Decryption walks a list of candidate keys — primary first, then deprecated
// fallbacks — because swapping TOTP_ENCRYPTION_KEY or JWT_SECRET across
// deployments otherwise silently locks out every enrolled user. When decryption
// finally succeeds under a non-primary key, the caller should re-encrypt the
// secret under the primary key to complete the migration (see verify/route.ts).

export class TotpDecryptError extends Error {
  readonly code = 'TOTP_UNREADABLE';
  constructor(message = 'TOTP secret could not be decrypted with any known key') {
    super(message);
    this.name = 'TotpDecryptError';
  }
}

function primaryEncryptionKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TOTP_ENCRYPTION_KEY must be a 64-char hex string in production');
    }
    // Dev-only fallback. Still deterministic so local restarts don't break enrollments.
    return crypto.createHash('sha256').update('dev-only-insecure-key').digest();
  }
  return Buffer.from(key, 'hex');
}

// Keys to try when decrypting. Order: primary → versioned history → derived-from-JWT →
// dev fallback. Add old keys as TOTP_ENCRYPTION_KEY_V{N} during rotations.
function decryptionKeyCandidates(): Buffer[] {
  const keys: Buffer[] = [primaryEncryptionKey()];

  // Historical versioned keys — set these when rotating.
  for (let i = 2; i <= 10; i++) {
    const old = process.env[`TOTP_ENCRYPTION_KEY_V${i}`];
    if (old && old.length === 64) keys.push(Buffer.from(old, 'hex'));
  }

  // Legacy: keys derived from JWT_SECRET / SUPABASE_JWT_SECRET. Older versions of this
  // file used these as the encryption key itself when TOTP_ENCRYPTION_KEY was absent,
  // so rows encrypted then must still be readable now.
  const jwt = process.env.JWT_SECRET;
  if (jwt) keys.push(crypto.createHash('sha256').update(jwt).digest());
  const supaJwt = process.env.SUPABASE_JWT_SECRET;
  if (supaJwt && supaJwt !== jwt) keys.push(crypto.createHash('sha256').update(supaJwt).digest());

  // Dev fallback — same value the previous version of this file fell back to.
  if (process.env.NODE_ENV !== 'production') {
    keys.push(crypto.createHash('sha256').update('dev-only-insecure-key').digest());
  }

  return keys;
}

function tryDecrypt(key: Buffer, ivHex: string, tagHex: string, encHex: string): string | null {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

export function encryptSecret(plaintext: string): string {
  const key = primaryEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Returns { secret, needsRewrap }. `needsRewrap` is true when decryption succeeded under
// a non-primary key — callers should re-encrypt with encryptSecret() to complete the
// migration to the current primary key.
export function decryptSecretDetailed(stored: string): { secret: string; needsRewrap: boolean } {
  // Legacy plaintext — no colons means no encryption at all.
  if (!stored.includes(':')) {
    return { secret: stored, needsRewrap: true };
  }

  const parts = stored.split(':');
  let ivHex: string, tagHex: string, encHex: string;
  if (parts[0] === 'v1' && parts.length === 4) {
    [, ivHex, tagHex, encHex] = parts;
  } else if (parts.length === 3) {
    [ivHex, tagHex, encHex] = parts;
  } else {
    throw new TotpDecryptError('TOTP secret has an unrecognized storage format');
  }

  const candidates = decryptionKeyCandidates();
  for (let i = 0; i < candidates.length; i++) {
    const plaintext = tryDecrypt(candidates[i], ivHex, tagHex, encHex);
    if (plaintext !== null) {
      return { secret: plaintext, needsRewrap: i !== 0 };
    }
  }

  throw new TotpDecryptError();
}

// Backward-compatible shim for callers that only want the secret.
export function decryptSecret(stored: string): string {
  return decryptSecretDetailed(stored).secret;
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
