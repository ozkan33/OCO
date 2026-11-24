// Reset 2FA for EVERY account so each one enrolls again at next sign-in.
// Same effect per user as scripts/reset-2fa.mjs / resetUserMfa().
//
//   node scripts/reset-all-2fa.mjs                      dry run: counts only
//   node scripts/reset-all-2fa.mjs --apply              reset authenticators, recovery codes, trusted devices
//   node scripts/reset-all-2fa.mjs --apply --passkeys   also remove passkeys (Face ID / Touch ID sign-in)
//   node scripts/reset-all-2fa.mjs --apply --password   also force a new password at next sign-in
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const withPasskeys = args.has('--passkeys');
const withPassword = args.has('--password');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing Supabase env vars.'); process.exit(1); }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const users = [];
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error.message); process.exit(1); }
  users.push(...data.users);
  if (data.users.length < 200) break;
}

const count = async (table, filter) => {
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  return error ? `error: ${error.message}` : n;
};

const byRole = {};
for (const u of users) {
  const r = u.app_metadata?.role || '(none)';
  byRole[r] = (byRole[r] || 0) + 1;
}

console.log(`Project: ${url.replace(/^https?:\/\//, '').split('.')[0]}`);
console.log(`Accounts: ${users.length}`, byRole);
console.log(`Enrolled authenticators: ${await count('user_totp_secrets', q => q.eq('is_enabled', true))}`);
console.log(`Unused recovery codes:   ${await count('mfa_recovery_codes', q => q.is('used_at', null))}`);
console.log(`Trusted devices:         ${await count('trusted_devices')}`);
console.log(`Passkeys:                ${await count('webauthn_credentials')}  (${withPasskeys ? 'will be removed' : 'kept'})`);
console.log(`Force new password:      ${withPassword ? 'yes' : 'no'}`);

if (!apply) {
  console.log('\nDry run — nothing changed. Re-run with --apply to reset.');
  process.exit(0);
}

const NONE = '00000000-0000-0000-0000-000000000000';
const tables = ['user_totp_secrets', 'mfa_recovery_codes', 'trusted_devices', ...(withPasskeys ? ['webauthn_credentials'] : [])];
for (const table of tables) {
  const { error } = await db.from(table).delete().neq('user_id', NONE);
  console.log(`  ${table}: ${error ? error.message : 'cleared'}`);
}

const profilePatch = { totp_enabled: false, must_enroll_2fa: true, ...(withPassword ? { must_change_password: true } : {}) };
const { error: profErr } = await db.from('brand_user_profiles').update(profilePatch).neq('id', NONE);
console.log(`  brand_user_profiles: ${profErr ? profErr.message : 'updated'}`);

let ok = 0;
for (const u of users) {
  // Bumping the epoch invalidates every existing "2FA passed" cookie at once.
  const { error } = await db.auth.admin.updateUserById(u.id, {
    app_metadata: {
      mfa_enrolled: false,
      mfa_epoch: (Number(u.app_metadata?.mfa_epoch) || 0) + 1,
      ...(withPassword ? { must_change_password: true } : {}),
    },
  });
  if (error) { console.warn(`  ${u.email}: ${error.message}`); continue; }
  await db.rpc('revoke_user_sessions', { p_user: u.id });
  await db.from('mfa_events').insert({ user_id: u.id, event: 'bulk_reset' });
  ok++;
}
console.log(`\nReset ${ok} of ${users.length} accounts. Each must set up 2FA at next sign-in.`);
