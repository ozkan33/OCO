import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { Capability } from '../../../../../../lib/rbac';
import { authorize } from '../../../../../../lib/rbac/requireCapability';

// GET /api/portal/weekly-summary/history
// Returns a lightweight list of past weekly summaries for the brand user —
// week, stats, and generated_at only (no markdown body). The UI uses this to
// render a picker; once the user selects a week, it fetches the full summary
// via /api/portal/weekly-summary?week=YYYY-MM-DD.
//
// ?limit=N  — how many weeks back (default 26, max 104).
export async function GET(request: Request) {
  const auth = await authorize(request, Capability.SCORECARD_READ);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {
    const { data: profile } = await supabaseAdmin
      .from('brand_user_profiles')
      .select('brand_name')
      .eq('id', user.id)
      .maybeSingle();

    const brandName = profile?.brand_name || user.user_metadata?.brand;
    if (!brandName) {
      return NextResponse.json({ history: [] });
    }

    const url = new URL(request.url);
    const limitRaw = parseInt(url.searchParams.get('limit') || '26', 10);
    const limit = Math.min(Math.max(isNaN(limitRaw) ? 26 : limitRaw, 1), 104);

    const { data: rows } = await supabaseAdmin
      .from('weekly_summaries')
      .select('week_of, stats, generated_at')
      .eq('brand_name', brandName)
      .order('week_of', { ascending: false })
      .limit(limit);

    const history = (rows || []).map((r) => ({
      weekOf: r.week_of,
      stats: r.stats || {},
      generatedAt: r.generated_at,
    }));

    return NextResponse.json({ history });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
