import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { resolveAuthorInfo } from '../../../../../lib/commentAuthors';

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

    // Find the primary scorecard id for this brand user so we can fetch
    // market-visit comments (stored under comments table with row_id = store_name)
    const { data: assignments } = await supabaseAdmin
      .from('brand_user_assignments')
      .select('scorecard_id')
      .eq('user_id', user.id);

    const scorecardIds = (assignments || []).map((a: { scorecard_id: string }) => a.scorecard_id);

    let commentsByStore: Record<string, Array<{ id: string; text: string; author: string; date: string; isOwn: boolean }>> = {};

    if (scorecardIds.length > 0 && (visits || []).length > 0) {
      const storeNames = Array.from(new Set((visits || []).map((v) => v.store_name).filter(Boolean)));

      if (storeNames.length > 0) {
        const { data: allComments } = await supabaseAdmin
          .from('comments')
          .select('id, scorecard_id, row_id, text, user_id, user_email, created_at')
          .in('scorecard_id', scorecardIds)
          .in('row_id', storeNames)
          .order('created_at', { ascending: true });

        const emailByUserId = new Map<string, string | null>();
        for (const c of allComments || []) {
          if (c.user_id && !emailByUserId.has(c.user_id)) {
            emailByUserId.set(c.user_id, c.user_email ?? null);
          }
        }
        const authorInfo = await resolveAuthorInfo(
          (allComments || []).map((c) => c.user_id),
          emailByUserId,
        );
        for (const c of allComments || []) {
          const info = c.user_id ? authorInfo.get(c.user_id) : undefined;
          const fallbackPrefix = (c.user_email || 'Admin').split('@')[0];
          const author = info?.name || (fallbackPrefix.charAt(0).toUpperCase() + fallbackPrefix.slice(1));
          const key = String(c.row_id);
          if (!commentsByStore[key]) commentsByStore[key] = [];
          commentsByStore[key].push({
            id: c.id,
            text: c.text,
            author,
            date: c.created_at,
            isOwn: c.user_id === user.id,
          });
        }
      }
    }

    const enriched = (visits || []).map((v) => ({
      ...v,
      comments: v.store_name && commentsByStore[v.store_name] ? commentsByStore[v.store_name] : [],
    }));

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
