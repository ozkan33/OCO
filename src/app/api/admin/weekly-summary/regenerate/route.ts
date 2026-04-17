import { NextResponse } from 'next/server';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { buildWeeklySummaryForBrand, mondayOf } from '@/lib/weeklySummary';
import { logger } from '../../../../../../lib/logger';

// POST /api/admin/weekly-summary/regenerate
// Body: { brand_name: string, week_of?: "YYYY-MM-DD" }
// Regenerates the weekly summary for a single brand. week_of defaults to the
// most recently completed week (last Monday).
export async function POST(request: Request) {
  try {
    const admin = await getUserFromToken(request);
    if (admin.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const brandName: string | undefined = body?.brand_name;
    const weekParam: string | undefined = body?.week_of;

    if (!brandName || typeof brandName !== 'string') {
      return NextResponse.json({ error: 'brand_name is required' }, { status: 400 });
    }

    let weekOf: Date;
    if (weekParam) {
      const parsed = new Date(`${weekParam}T00:00:00Z`);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid week_of' }, { status: 400 });
      }
      weekOf = mondayOf(parsed);
    } else {
      const today = mondayOf(new Date());
      today.setUTCDate(today.getUTCDate() - 7);
      weekOf = today;
    }

    const { data, summary } = await buildWeeklySummaryForBrand(brandName, weekOf);
    return NextResponse.json({
      brand: brandName,
      week_of: data.weekOf,
      stats: data.stats,
      summary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[admin regenerate summary] failed:', msg);
    const status = msg.includes('Unauthorized') || msg.includes('token') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
