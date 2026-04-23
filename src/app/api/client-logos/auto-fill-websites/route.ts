import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { resolveLogoWebsite } from '@/lib/resolveLogoWebsite';

const VALID_KINDS = new Set(['brand', 'retailer']);

// Guard against runaway outbound traffic: bounded concurrency plus a hard cap
// on how many rows we'll process per invocation. The admin can click again
// if there are still blanks after the first pass.
const MAX_ROWS_PER_CALL = 50;
const CONCURRENCY = 5;

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

// POST /api/client-logos/auto-fill-websites — for every logo of the given kind
// (or both kinds if omitted) that has no website_url, try to resolve one and
// persist it. Idempotent: rows that already have a URL are untouched, and rows
// we can't resolve are left blank (admin can still fill manually).
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawKind = typeof body?.kind === 'string' ? body.kind.trim().toLowerCase() : null;
    const kind = rawKind && VALID_KINDS.has(rawKind) ? (rawKind as 'brand' | 'retailer') : null;

    let query = supabaseAdmin
      .from('client_logos')
      .select('id, label, kind, website_url')
      .is('website_url', null)
      .order('sort_order', { ascending: true })
      .limit(MAX_ROWS_PER_CALL);
    if (kind) query = query.eq('kind', kind);

    const { data: rows, error: fetchError } = await query;
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ scanned: 0, updated: 0, skipped: 0 });
    }

    const resolved = await mapPool(rows, CONCURRENCY, async (row) => {
      const rowKind = (row.kind === 'retailer' ? 'retailer' : 'brand') as 'brand' | 'retailer';
      try {
        const url = await resolveLogoWebsite(row.label, rowKind);
        return { id: row.id, url };
      } catch {
        return { id: row.id, url: null as string | null };
      }
    });

    const hits = resolved.filter((r): r is { id: string; url: string } => !!r.url);

    // Update one at a time — the set is small and Supabase's row-level update
    // is trivially fast. Keeps the SQL simple and avoids a CASE-WHEN blob.
    let updated = 0;
    for (const hit of hits) {
      const { error: upErr } = await supabaseAdmin
        .from('client_logos')
        .update({ website_url: hit.url, updated_at: new Date().toISOString() })
        .eq('id', hit.id)
        .is('website_url', null);
      if (!upErr) updated++;
    }

    return NextResponse.json({
      scanned: rows.length,
      updated,
      skipped: rows.length - updated,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
