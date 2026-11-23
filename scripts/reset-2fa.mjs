// Break-glass 2FA reset for any account, including Admins (who have no row on
// the Clients page). Mirrors resetUserMfa() in lib/mfa/state.ts.
//
//   node scripts/reset-2fa.mjs user@example.com
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const email = (process.argv[2] || '').toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error('Usage: node scripts/reset-2fa.mjs <email>  (with Supabase env vars set)');
  process.exit(1);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error.message); process.exit(1); }
  user = data.users.find(u => (u.email || '').toLowerCase() === email) || null;
  if (data.users.length < 200) break;
}
if (!user) { console.error(`No user with email ${email}`); process.exit(1); }

for (const table of ['user_totp_secrets', 'mfa_recovery_codes', 'trusted_devices', 'webauthn_credentials']) {
  const { error } = await db.from(table).delete().eq('user_id', user.id);
  if (error) console.warn(`  ${table}: ${error.message}`);
}
await db.from('brand_user_profiles').update({ totp_enabled: false, must_enroll_2fa: true }).eq('id', user.id);

const epoch = (Number(user.app_metadata?.mfa_epoch) || 0) + 1;
const { error: metaErr } = await db.auth.admin.updateUserById(user.id, {
  app_metadata: { mfa_enrolled: false, mfa_epoch: epoch },
});
if (metaErr) { console.error(metaErr.message); process.exit(1); }

const { error: revokeErr } = await db.rpc('revoke_user_sessions', { p_user: user.id });
if (revokeErr) console.warn(`  session revoke: ${revokeErr.message}`);

await db.from('mfa_events').insert({ user_id: user.id, event: 'script_reset' });
console.log(`2FA reset for ${email}. They must set up a new authenticator at next sign-in.`);
