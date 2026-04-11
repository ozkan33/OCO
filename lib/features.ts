// ─── Feature Flags ───────────────────────────────────────────────────────────
// Flip any flag to false to disable a feature instantly without redeploying.
// These are evaluated at runtime (not build time), so a server restart applies them.

export const features = {
  /** Two-factor authentication (TOTP) for brand users */
  ENABLE_2FA: true,

  /** Trusted device cookies (skip 2FA for 30 days) */
  ENABLE_TRUSTED_DEVICES: true,

  /** Login session tracking (timestamps, IP, duration) */
  ENABLE_LOGIN_TRACKING: true,

  /** Brand client portal (/portal) */
  ENABLE_BRAND_PORTAL: true,

  /** Force password change on first login for brand users */
  ENABLE_FORCED_PASSWORD_CHANGE: true,
} as const;
