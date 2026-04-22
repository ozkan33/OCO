import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { logger } from '../../../../../../lib/logger';

const MIN_RESPONSE_MS = 180;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  if (ipBuckets.size > 100 && Math.random() < 0.02) {
    ipBuckets.forEach((rec, k) => {
      if (now > rec.resetAt) ipBuckets.delete(k);
    });
  }
  const rec = ipBuckets.get(ip);
  if (!rec || now > rec.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT_MAX;
}

async function pad(start: number) {
  const elapsed = Date.now() - start;
  const wait = MIN_RESPONSE_MS - elapsed;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function lookupUserByEmail(email: string): Promise<{ id: string } | null> {
  try {
    const lowered = email.toLowerCase();
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data?.users?.length) return null;
      const match = data.users.find((u) => (u.email ?? '').toLowerCase() === lowered);
      if (match) return { id: match.id };
      if (data.users.length < 200) return null;
    }
    return null;
  } catch (e) {
    logger.warn('webauthn has-credentials: listUsers failed —', e instanceof Error ? e.message : e);
    return null;
  }
}

async function handle(email: string, request: Request) {
  const start = Date.now();
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    await pad(start);
    return NextResponse.json({ has: false }, { status: 429 });
  }

  const trimmed = (email ?? '').toString().trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    await pad(start);
    return NextResponse.json({ has: false });
  }

  const user = await lookupUserByEmail(trimmed);
  if (!user) {
    await pad(start);
    return NextResponse.json({ has: false });
  }

  const { count, error } = await supabaseAdmin
    .from('webauthn_credentials')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  await pad(start);
  if (error) {
    logger.error('webauthn has-credentials: count failed —', error.message);
    return NextResponse.json({ has: false });
  }
  return NextResponse.json({ has: (count ?? 0) > 0 });
}

export async function POST(request: Request) {
  let email = '';
  try {
    const body = await request.json();
    email = body?.email ?? '';
  } catch {
    // empty email handled in handle()
  }
  return handle(email, request);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handle(url.searchParams.get('email') ?? '', request);
}
