import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { Role, getRoleFromUser } from '../../../../lib/rbac';

// GET /api/brands - Distinct brand names. ADMIN sees only brands from their
// own scorecards (their portfolio); internal roles that can create market
// visits (KAM / FSR) see every brand across all admins so they can tag
// whichever brand's product they visited.
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = getRoleFromUser(user);

    let query = supabaseAdmin
      .from('user_scorecards')
      .select('title')
      .order('title', { ascending: true });

    if (role === Role.ADMIN) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deduplicate and filter out ghost/untitled scorecards
    const seen = new Set<string>();
    const brands: string[] = [];
    for (const row of data || []) {
      const t = (row.title || '').trim();
      if (!t || t.toLowerCase() === 'untitled' || t.toLowerCase() === 'untitled scorecard') continue;
      if (/^\d+\s*retailers?$/i.test(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      brands.push(t);
    }

    return NextResponse.json(brands);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
