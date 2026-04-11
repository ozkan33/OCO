import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

// GET /api/portal/market-visits - Get market visits for this brand
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = user.user_metadata?.role;

    if (role !== 'BRAND' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const brandName = user.user_metadata?.brand;
    if (!brandName) {
      return NextResponse.json([]);
    }

    // Fetch market visits tagged with this brand only
    const { data: visits, error } = await supabaseAdmin
      .from('market_visits')
      .select('id, photo_url, visit_date, store_name, address, note, brands, created_at')
      .contains('brands', [brandName])
      .order('visit_date', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(visits || []);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
