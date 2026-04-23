import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { resolveAuthorInfo } from '../../../../../lib/commentAuthors';
import { logger } from '../../../../../lib/logger';
import { Capability, Role, hasCapability } from '../../../../../lib/rbac';
import { authorize } from '../../../../../lib/rbac/requireCapability';

const hasManageAny = (role: Role | null) => hasCapability(role, Capability.MARKET_VISITS_MANAGE_ANY);

// Signed URLs are valid for 24h; we reuse them across requests so that Next's
// image optimizer (and the browser) can CDN-cache the same URL instead of
// busting cache on every portal reload. Cache is process-local — a fresh
// serverless instance will re-sign, which is fine.
const PHOTO_URL_TTL_SECONDS = 60 * 60 * 24;
const PHOTO_CACHE_TTL_MS = (PHOTO_URL_TTL_SECONDS - 300) * 1000; // expire slightly early

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

async function signPhoto(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }
  const { data, error } = await supabaseAdmin.storage
    .from('market-photos')
    .createSignedUrl(path, PHOTO_URL_TTL_SECONDS);
  if (error || !data) return null;
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: now + PHOTO_CACHE_TTL_MS });
  return data.signedUrl;
}

// GET /api/portal/market-visits - Get market visits visible to the caller.
//   BRAND users: only visits tagged with their brand
//   KAM / FSR / ADMIN: all visits (internal staff)
export async function GET(request: Request) {
  const auth = await authorize(request, Capability.MARKET_VISITS_READ);
  if (!auth.ok) return auth.response;
  const { user, role } = auth;

  try {
    let query = supabaseAdmin
      .from('market_visits')
      .select('id, user_id, photo_url, photo_storage_path, visit_date, store_name, address, note, brands, latitude, longitude, accuracy_m, location_source, photo_taken_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (role === Role.BRAND) {
      const brandName = user.user_metadata?.brand;
      if (!brandName) {
        return NextResponse.json([]);
      }
      query = query.contains('brands', [brandName]);
    }

    const { data: visits, error } = await query;

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

    // Resolve author display name + role for every visit — drives the
    // "Added by Tom (Field Sales Rep)" byline in the portal UI.
    const authorInfo = await resolveAuthorInfo(
      (visits || []).map((v) => v.user_id),
    );

    const canEditAny = hasManageAny(role);

    const enriched = await Promise.all(
      (visits || []).map(async (v) => {
        const info = v.user_id ? authorInfo.get(v.user_id) : undefined;
        return {
          ...v,
          photo_url: (await signPhoto(v.photo_storage_path)) ?? v.photo_url,
          comments: v.store_name && commentsByStore[v.store_name] ? commentsByStore[v.store_name] : [],
          author: info
            ? { id: v.user_id, name: info.name, roleLabel: info.roleLabel, role: info.role }
            : { id: v.user_id, name: 'Unknown', roleLabel: null, role: null },
          isOwn: v.user_id === user.id,
          canEdit: canEditAny || v.user_id === user.id,
        };
      }),
    );

    return NextResponse.json(enriched);
  } catch (err) {
    logger.error('Portal market-visits GET failed:', err);
    return NextResponse.json({ error: 'Failed to load market visits' }, { status: 500 });
  }
}
