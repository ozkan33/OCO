import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { resolveAuthorInfo } from '../../../../../lib/commentAuthors';
import { logger } from '../../../../../lib/logger';

const PHOTO_URL_TTL_SECONDS = 60 * 60;

async function signPhoto(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage
    .from('market-photos')
    .createSignedUrl(path, PHOTO_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

// GET /api/portal/market-visits - Get market visits for this brand
export async function GET(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = user.user_metadata?.role;
  if (role !== 'BRAND' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const brandName = user.user_metadata?.brand;
    if (!brandName) {
      return NextResponse.json([]);
    }

    // Fetch market visits tagged with this brand only
    const { data: visits, error } = await supabaseAdmin
      .from('market_visits')
      .select('id, photo_url, photo_storage_path, visit_date, store_name, address, note, brands, latitude, longitude, accuracy_m, location_source, photo_taken_at, created_at')
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
        // Exclude auto-generated market-visit comments — they duplicate the
        // visit note that's already rendered above the thread on the visits tab.
        const { data: allComments } = await supabaseAdmin
          .from('comments')
          .select('id, scorecard_id, row_id, text, user_id, user_email, created_at, market_visit_id')
          .in('scorecard_id', scorecardIds)
          .in('row_id', storeNames)
          .is('market_visit_id', null)
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

    const enriched = await Promise.all(
      (visits || []).map(async (v) => ({
        ...v,
        photo_url: (await signPhoto(v.photo_storage_path)) ?? v.photo_url,
        comments: v.store_name && commentsByStore[v.store_name] ? commentsByStore[v.store_name] : [],
      })),
    );

    return NextResponse.json(enriched);
  } catch (err) {
    logger.error('Portal market-visits GET failed:', err);
    return NextResponse.json({ error: 'Failed to load market visits' }, { status: 500 });
  }
}
