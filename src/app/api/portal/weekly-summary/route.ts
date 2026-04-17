import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

// GET /api/portal/weekly-summary
// Returns the weekly summary for the authenticated brand user.
//   (no params)           → most recent summary
//   ?week=YYYY-MM-DD      → specific week (by Monday date)
// Returns { summary: null } if none found.
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = user.user_metadata?.role;
    if (role !== 'BRAND' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: profile } = await supabaseAdmin
      .from('brand_user_profiles')
      .select('brand_name')
      .eq('id', user.id)
      .maybeSingle();

    const brandName = profile?.brand_name || user.user_metadata?.brand;
    if (!brandName) {
      return NextResponse.json({ summary: null });
    }

    const url = new URL(request.url);
    const weekParam = url.searchParams.get('week');

    let query = supabaseAdmin
      .from('weekly_summaries')
      .select('week_of, summary_md, stats, generated_at')
      .eq('brand_name', brandName);

    if (weekParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
        return NextResponse.json({ error: 'Invalid week format, expected YYYY-MM-DD' }, { status: 400 });
      }
      query = query.eq('week_of', weekParam);
    } else {
      query = query.order('week_of', { ascending: false }).limit(1);
    }

    const { data: row } = await query.maybeSingle();

    if (!row) {
      return NextResponse.json({ summary: null });
    }

    return NextResponse.json({
      summary: {
        weekOf: row.week_of,
        markdown: row.summary_md,
        stats: row.stats || {},
        generatedAt: row.generated_at,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
