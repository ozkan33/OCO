import { NextResponse } from 'next/server';
import {
  buildWeeklySummaryForBrand,
  listActiveBrands,
  mondayOf,
} from '@/lib/weeklySummary';
import { logger } from '../../../../../lib/logger';

// Each brand call is ~2-5s (Gemini latency + Supabase round trips).
// Allow up to 60s so a batch of ~15 brands fits comfortably.
// Vercel Hobby caps at 60s; Pro can extend to 300s if you need more.
export const maxDuration = 60;

// Protect: only Vercel Cron (or an admin with the secret) can invoke this.
// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

// GET /api/cron/weekly-summary
//   Runs every Monday 13:00 UTC (see vercel.json). Generates summaries for
//   every active brand for the most recent completed week.
//
// Query params (for manual backfill / test):
//   ?brand=Name         — only generate for this brand
//   ?week=YYYY-MM-DD    — week_of date (Monday). Defaults to last Monday.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const brandParam = url.searchParams.get('brand');
  const weekParam = url.searchParams.get('week');

  // Default week_of = Monday of the most recently *completed* week.
  // Run on Monday morning → summarize previous Mon-Sun.
  let weekOf: Date;
  if (weekParam) {
    const parsed = new Date(`${weekParam}T00:00:00Z`);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid week param' }, { status: 400 });
    }
    weekOf = mondayOf(parsed);
  } else {
    const today = mondayOf(new Date());
    today.setUTCDate(today.getUTCDate() - 7);
    weekOf = today;
  }

  const brands = brandParam ? [brandParam] : await listActiveBrands();
  const results: Array<{ brand: string; ok: boolean; error?: string; stats?: unknown }> = [];

  for (const brand of brands) {
    try {
      const { data } = await buildWeeklySummaryForBrand(brand, weekOf);
      results.push({ brand, ok: true, stats: data.stats });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[weekly-summary] failed for ${brand}: ${msg}`);
      results.push({ brand, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    week_of: weekOf.toISOString().slice(0, 10),
    brands: brands.length,
    results,
  });
}
