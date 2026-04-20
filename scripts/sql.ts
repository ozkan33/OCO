/**
 * SQL runner — execute arbitrary SQL against the Supabase project via the
 * `exec_sql` RPC (see supabase/migrations/20240101000034_exec_sql_rpc.sql).
 *
 * Usage:
 *   npm run sql -- <file.sql>                 # run a file
 *   npm run sql -- "select count(*) from comments"   # run inline SQL
 *   npm run sql -- stdin                      # run from stdin (see below)
 *   npm run sql -- init                       # print bootstrap SQL for the RPC
 *
 * stdin examples:
 *   PowerShell:  Get-Content query.sql | npm run sql -- stdin
 *   bash/zsh:    npm run sql -- stdin < query.sql
 *
 * Files may contain multiple statements separated by `;` at end of line.
 * $$-quoted blocks (functions, DO blocks) are respected.
 *
 * NOTE: positional words ('init', 'stdin') are used instead of `--init` /
 * `--stdin` because npm intercepts `--init` (reserved for `npm init`) and
 * some Windows shells mangle `--` arg forwarding.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BOOTSTRAP_PATH = 'supabase/migrations/20240101000034_exec_sql_rpc.sql';

/** Split a SQL blob into statements, respecting $$…$$ dollar-quoted bodies and '…' string literals. */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const c = sql[i];
    const rest = sql.slice(i);

    if (dollarTag) {
      buf += c;
      if (rest.startsWith(dollarTag)) {
        buf += dollarTag.slice(1);
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
      buf += c;
      if (c === "'" && sql[i + 1] !== "'") inSingle = false;
      else if (c === "'" && sql[i + 1] === "'") { buf += "'"; i++; }
      i++;
      continue;
    }

    // Line comment
    if (c === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl + 1;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }
    // Block comment
    if (c === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2);
      const end = close === -1 ? sql.length : close + 2;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }
    // Dollar quote open: $tag$ or $$
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (c === "'") { inSingle = true; buf += c; i++; continue; }
    if (c === ';') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

type RpcResult = unknown;

async function execOne(stmt: string, label: string): Promise<boolean> {
  const { data, error } = await db.rpc('exec_sql', { query: stmt });
  if (error) {
    console.error(`  ✗ ${label}: ${error.message}`);
    if (error.message.includes('exec_sql') || error.code === 'PGRST202') {
      console.error(`\n  The exec_sql RPC is not installed yet.`);
      console.error(`  Run "npm run sql -- init" to print the bootstrap SQL, then paste`);
      console.error(`  it once into the Supabase SQL editor. All future runs are automated.\n`);
    }
    return false;
  }
  renderResult(data, label);
  return true;
}

function renderResult(data: RpcResult, label: string) {
  if (Array.isArray(data)) {
    console.log(`  ✓ ${label} — ${data.length} row(s)`);
    if (data.length === 0) return;
    const preview = data.slice(0, 50);
    console.table(preview);
    if (data.length > preview.length) {
      console.log(`    …${data.length - preview.length} more rows`);
    }
    return;
  }
  if (data && typeof data === 'object' && 'ok' in (data as Record<string, unknown>)) {
    const cmd = (data as { command?: string }).command ?? 'OK';
    console.log(`  ✓ ${label} — ${cmd}`);
    return;
  }
  console.log(`  ✓ ${label}`);
}

function printBootstrap() {
  const abs = path.resolve(BOOTSTRAP_PATH);
  if (!fs.existsSync(abs)) {
    console.error(`Bootstrap file missing: ${BOOTSTRAP_PATH}`);
    process.exit(1);
  }
  console.log(`\n-- Paste the following into the Supabase SQL editor once. --\n`);
  console.log(fs.readFileSync(abs, 'utf8'));
  console.log(`\n-- After that, "npm run sql -- <file|query>" will run end-to-end. --\n`);
}

async function readStdin(): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function usage(): never {
  console.log(`
Usage:
  npm run sql -- <file.sql>
  npm run sql -- "select ..."
  npm run sql -- stdin                     # read SQL from stdin
  npm run sql -- init                      # print bootstrap SQL for exec_sql RPC

Stdin examples:
  PowerShell:  Get-Content query.sql | npm run sql -- stdin
  bash/zsh:    npm run sql -- stdin < query.sql
`);
  process.exit(1);
}

(async () => {
  const arg = process.argv[2];
  if (!arg) usage();

  // Accept both positional ('init') and flag ('--init') forms for convenience,
  // but note: npm strips `--init` (reserved), so only the positional actually
  // reaches us through `npm run sql`.
  if (arg === 'init' || arg === '--init') { printBootstrap(); return; }

  let sql: string;
  let label: string;
  if (arg === 'stdin' || arg === '--stdin') {
    sql = await readStdin();
    label = 'stdin';
  } else if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
    sql = fs.readFileSync(arg, 'utf8');
    label = path.basename(arg);
  } else {
    sql = arg;
    label = 'inline';
  }

  const statements = splitStatements(sql);
  if (statements.length === 0) {
    console.error('No SQL statements found.');
    process.exit(1);
  }

  console.log(`\n▶ ${label} — ${statements.length} statement(s)\n`);
  let ok = true;
  for (let i = 0; i < statements.length; i++) {
    const tag = `[${i + 1}/${statements.length}]`;
    const passed = await execOne(statements[i], tag);
    if (!passed) { ok = false; break; }
  }
  if (!ok) process.exit(1);
  console.log('');
})();
