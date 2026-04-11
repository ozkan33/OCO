/**
 * Database admin utility — run with: npx tsx scripts/db.ts <command>
 *
 * Commands:
 *   clean       - Delete all app data (keeps tables + admin account)
 *   clean-ghosts - Delete ghost/untitled scorecards
 *   status      - Show row counts for all tables
 *   drop-backups - Drop _after_ backup tables
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const command = process.argv[2];

async function status() {
  console.log('\n📊 Database Status\n');
  const tables = [
    'user_scorecards', 'comments', 'market_visits', 'brand_user_profiles',
    'brand_user_assignments', 'login_sessions', 'trusted_devices',
    'user_totp_secrets', 'notifications', 'scorecard_templates', 'templates',
  ];
  for (const table of tables) {
    try {
      const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
      if (error) console.log(`  ${table}: ⚠ ${error.message}`);
      else console.log(`  ${table}: ${count} rows`);
    } catch { console.log(`  ${table}: ⚠ not found`); }
  }

  // Count auth users by role
  const { data: users } = await db.auth.admin.listUsers();
  const admins = users?.users?.filter(u => u.user_metadata?.role === 'ADMIN') || [];
  const brands = users?.users?.filter(u => u.user_metadata?.role === 'BRAND') || [];
  console.log(`\n  Auth users: ${users?.users?.length || 0} total (${admins.length} admin, ${brands.length} brand)`);
  console.log('');
}

async function clean() {
  console.log('\n🧹 Cleaning all application data...\n');

  const ops = [
    ['login_sessions', db.from('login_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000')],
    ['trusted_devices', db.from('trusted_devices').delete().neq('id', '00000000-0000-0000-0000-000000000000')],
    ['user_totp_secrets', db.from('user_totp_secrets').delete().neq('user_id', '00000000-0000-0000-0000-000000000000')],
    ['brand_user_assignments', db.from('brand_user_assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000')],
    ['brand_user_profiles', db.from('brand_user_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')],
    ['comments', db.from('comments').delete().neq('id', '00000000-0000-0000-0000-000000000000')],
    ['notifications', db.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000')],
    ['user_scorecards', db.from('user_scorecards').delete().neq('id', '00000000-0000-0000-0000-000000000000')],
    ['market_visits', db.from('market_visits').delete().neq('id', '00000000-0000-0000-0000-000000000000')],
  ];

  for (const [name, op] of ops) {
    const { error } = await (op as any);
    if (error) console.log(`  ⚠ ${name}: ${error.message}`);
    else console.log(`  ✓ ${name}: cleared`);
  }

  // Delete brand users from auth
  const { data: users } = await db.auth.admin.listUsers();
  const brandUsers = users?.users?.filter(u => u.user_metadata?.role === 'BRAND') || [];
  for (const u of brandUsers) {
    await db.auth.admin.deleteUser(u.id);
    console.log(`  ✓ Deleted auth user: ${u.email}`);
  }

  console.log('\n✅ Done. Clear browser localStorage too:\n   localStorage.clear(); location.reload();\n');
}

async function cleanGhosts() {
  console.log('\n👻 Cleaning ghost scorecards...\n');
  const { data: scorecards } = await db.from('user_scorecards').select('id, title, data');
  if (!scorecards) { console.log('  No scorecards found.'); return; }

  let deleted = 0;
  for (const sc of scorecards) {
    const t = (sc.title || '').toLowerCase().trim();
    const isGhost = /^\d+\s*retailers?$/i.test(t) || t === 'untitled' || t === 'untitled scorecard' || t === 'item 1' || t === 'item 2' || t === '';
    const isEmpty = !sc.data?.rows?.length || sc.data.rows.length <= 2 && sc.data.rows.every((r: any) => r.name === 'Item 1' || r.name === 'Item 2');

    if (isGhost || isEmpty) {
      const { error } = await db.from('user_scorecards').delete().eq('id', sc.id);
      if (!error) { console.log(`  🗑 Deleted: "${sc.title}" (${sc.id})`); deleted++; }
    } else {
      console.log(`  ✓ Kept: "${sc.title}" (${sc.data?.rows?.length || 0} rows)`);
    }
  }
  console.log(`\n✅ Deleted ${deleted} ghost scorecards.\n`);
}

async function dropBackups() {
  console.log('\n🗂 Dropping backup/snapshot tables...\n');
  const backups = [
    'comments_after_20260113',
    'scorecard_history_after_20260113',
    'scorecard_rows_after_20260113',
    'scorecards_after_20260113',
    'scorecard_templates_after_20260113',
  ];
  for (const table of backups) {
    const { error } = await db.rpc('', undefined as any).then(() => null).catch(() => null) as any;
    // RPC won't work for DDL — use raw SQL via the REST API
    const res = await fetch(`${url}/rest/v1/rpc/`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    // Fallback: just log the SQL to run manually
    console.log(`  Run manually: DROP TABLE IF EXISTS ${table};`);
  }
  console.log('');
}

// ── Run ──────────────────────────────────────────────────────────────────────
(async () => {
  switch (command) {
    case 'status': await status(); break;
    case 'clean': await clean(); break;
    case 'clean-ghosts': await cleanGhosts(); break;
    case 'drop-backups': await dropBackups(); break;
    default:
      console.log(`
Usage: npx tsx scripts/db.ts <command>

Commands:
  status        Show row counts for all tables
  clean         Delete ALL app data (keeps tables + admin account)
  clean-ghosts  Delete ghost/empty scorecards only
  drop-backups  Show SQL to drop _after_ backup tables
`);
  }
})();
