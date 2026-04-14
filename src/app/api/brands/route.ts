import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';

// GET /api/brands - Get distinct brand names from the current user's scorecards
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);

    const { data, error } = await supabaseAdmin
      .from('user_scorecards')
      .select('title')
      .eq('user_id', user.id)
      .order('title', { ascending: true });

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
