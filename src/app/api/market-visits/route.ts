import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { logger } from '../../../../lib/logger';
import { bestMatch } from '../../../../lib/marketVisitMatcher';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const PHOTO_URL_TTL_SECONDS = 60 * 60; // 1 hour signed URLs

async function signPhoto(path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from('market-photos')
    .createSignedUrl(path, PHOTO_URL_TTL_SECONDS);
  if (error || !data) {
    logger.warn('Signed URL generation failed:', error?.message);
    return null;
  }
  return data.signedUrl;
}

// POST /api/market-visits — upload a visit photo
export async function POST(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.user_metadata?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const formData = await request.formData();

    const file = formData.get('file') as File | null;
    const visitDate = formData.get('visit_date') as string | null;
    const latitude = formData.get('latitude') as string | null;
    const longitude = formData.get('longitude') as string | null;
    const accuracyRaw = formData.get('accuracy_m') as string | null;
    const locationSourceRaw = formData.get('location_source') as string | null;
    const photoTakenAtRaw = formData.get('photo_taken_at') as string | null;
    const address = formData.get('address') as string | null;
    const storeName = formData.get('store_name') as string | null;
    const note = formData.get('note') as string | null;
    const brandsRaw = formData.get('brands') as string | null;

    // Validate file
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Photo must be under 10MB' }, { status: 400 });
    }
    // iOS Safari often sends empty or "image/heif" MIME type for HEIC photos
    const EXT_TO_MIME: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', heic: 'image/heic', heif: 'image/heic',
    };
    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
    const rawExt = file.name.split('.').pop()?.toLowerCase() || '';
    let mimeType = file.type.toLowerCase();

    // If MIME is empty (common on iOS), infer from file extension
    if (!mimeType || mimeType === 'application/octet-stream') {
      mimeType = EXT_TO_MIME[rawExt] || '';
    }
    // Normalize image/heif to image/heic for storage
    if (mimeType === 'image/heif') mimeType = 'image/heic';

    if (!ALLOWED_TYPES.includes(mimeType) && !ALLOWED_EXTENSIONS.includes(rawExt)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP and HEIC images are allowed' }, { status: 400 });
    }
    // Ensure we have a valid MIME type for storage
    if (!mimeType) mimeType = EXT_TO_MIME[rawExt] || 'image/jpeg';

    // Validate date — must be YYYY-MM-DD (Chrome, Safari, Firefox all use this format)
    if (!visitDate) {
      return NextResponse.json({ error: 'Visit date is required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate) || isNaN(Date.parse(visitDate))) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    // Validate brands
    let brands: string[] = [];
    if (brandsRaw) {
      try {
        brands = JSON.parse(brandsRaw);
      } catch {
        return NextResponse.json({ error: 'Invalid brands format' }, { status: 400 });
      }
      // Validate only the submitted brand names exist as scorecard titles.
      // Using `in()` avoids scanning every scorecard on every upload.
      if (brands.length > 0) {
        const { data: scorecards } = await supabaseAdmin
          .from('user_scorecards')
          .select('title')
          .in('title', brands);
        const validBrands = new Set((scorecards || []).map((s: any) => s.title));
        const invalid = brands.filter(b => !validBrands.has(b));
        if (invalid.length > 0) {
          return NextResponse.json({ error: `Unknown brands: ${invalid.join(', ')}` }, { status: 400 });
        }
      }
    }
    if (brands.length === 0) {
      return NextResponse.json({ error: 'At least one brand is required' }, { status: 400 });
    }

    // Upload to Supabase Storage
    const ext = ALLOWED_EXTENSIONS.includes(rawExt) ? rawExt : 'jpg';
    const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from('market-photos')
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType: mimeType,
        cacheControl: '3600',
      });

    if (uploadError) {
      logger.error('Market visit storage upload failed:', uploadError);
      return NextResponse.json({ error: 'Photo upload failed. Please try again.' }, { status: 500 });
    }

    // Insert database row — sanitize numeric fields to avoid NaN
    const parsedLat = latitude ? parseFloat(latitude) : null;
    const parsedLng = longitude ? parseFloat(longitude) : null;
    const parsedAccuracy = accuracyRaw ? parseFloat(accuracyRaw) : null;
    const VALID_SOURCES = ['exif', 'geolocation', 'manual'] as const;
    const locationSource = VALID_SOURCES.includes(locationSourceRaw as any)
      ? (locationSourceRaw as typeof VALID_SOURCES[number])
      : null;
    const parsedPhotoTakenAt = photoTakenAtRaw && !isNaN(Date.parse(photoTakenAtRaw))
      ? new Date(photoTakenAtRaw).toISOString()
      : null;
    // Placeholder public URL kept for legacy NOT NULL schema;
    // the gallery resolves signed URLs at read time via photo_storage_path.
    const { data: visit, error: dbError } = await supabaseAdmin
      .from('market_visits')
      .insert({
        user_id: user.id,
        photo_url: storagePath,
        photo_storage_path: storagePath,
        visit_date: visitDate,
        latitude: parsedLat !== null && !isNaN(parsedLat) ? parsedLat : null,
        longitude: parsedLng !== null && !isNaN(parsedLng) ? parsedLng : null,
        accuracy_m: parsedAccuracy !== null && !isNaN(parsedAccuracy) ? parsedAccuracy : null,
        location_source: locationSource,
        photo_taken_at: parsedPhotoTakenAt,
        address: address || null,
        store_name: storeName || null,
        note: note || null,
        brands: brands.filter(b => typeof b === 'string' && b.trim()),
      })
      .select()
      .single();

    if (dbError) {
      // Clean up uploaded file on DB failure
      await supabaseAdmin.storage.from('market-photos').remove([storagePath]);
      logger.error('Market visit DB insert failed:', dbError);
      return NextResponse.json({ error: 'Failed to save visit. Please try again.' }, { status: 500 });
    }

    // ── Auto-comment: match store_name to scorecard customer rows ──
    if (storeName && note) {
      try {
        // Fetch scorecards for the selected brands
        const { data: matchedScorecards } = await supabaseAdmin
          .from('user_scorecards')
          .select('id, title, data')
          .eq('user_id', user.id)
          .in('title', brands);

        if (matchedScorecards && matchedScorecards.length > 0) {
          const adminName = user.user_metadata?.name || user.email?.split('@')[0] || 'Admin';
          const timestamp = new Date().toISOString();

          for (const sc of matchedScorecards) {
            const rows = sc.data?.rows || [];

            // Pick the overall best match across BOTH top-level chain names and
            // every chain's subgrid. Critical ordering: a weak cross-chain
            // subgrid hit (e.g. "Woodbury" in L&B's subgrid for a typed
            // "Kowalski's Woodbury") must not pre-empt an exact chain-row name
            // match on the correct chain.
            let matchedRow: any = null;
            let matchedSubRow: any = null;
            let bestScore = 0;

            const chainHit = bestMatch(rows as any[], (r: any) => r?.name, storeName);
            if (chainHit && chainHit.score > bestScore) {
              bestScore = chainHit.score;
              matchedRow = chainHit.item;
              matchedSubRow = null;
            }

            for (const r of rows) {
              const subRows = r?.subgrid?.rows;
              if (!Array.isArray(subRows)) continue;
              const hit = bestMatch(subRows as any[], (sr: any) => sr?.store_name, storeName);
              if (hit && hit.score > bestScore) {
                bestScore = hit.score;
                matchedRow = r;
                matchedSubRow = hit.item;
              }
            }

            if (matchedRow) {
              // Insert comment on the matched row. Embed the visited store name
              // so downstream UI can show *which* market visit each note came
              // from (older comments without this suffix render gracefully).
              const commentText = `[Market Visit — ${visitDate} · ${storeName}] ${note}`;
              const { data: comment, error: commentErr } = await supabaseAdmin
                .from('comments')
                .insert({
                  scorecard_id: sc.id,
                  user_id: user.id,
                  user_email: user.email || '',
                  row_id: String(matchedRow.id),
                  text: commentText,
                  market_visit_id: visit.id,
                  created_at: timestamp,
                  updated_at: timestamp,
                })
                .select('id')
                .single();

              if (commentErr) {
                logger.error('Auto-comment insert failed:', commentErr);
                continue;
              }

              // ── Auto-fill subgrid comment ──
              // If we matched a specific subgrid row, comment only on that store.
              // Otherwise (chain-level match), comment on every subgrid row whose
              // name scores against the typed visit — but only one row with
              // the best score, to avoid fanning out across multiple stores.
              const subRowsToComment: any[] = matchedSubRow
                ? [matchedSubRow]
                : (() => {
                    const fanoutHit = bestMatch(
                      (matchedRow.subgrid?.rows || []) as any[],
                      (sr: any) => sr?.store_name,
                      storeName,
                    );
                    return fanoutHit ? [fanoutHit.item] : [];
                  })();

              for (const subRow of subRowsToComment) {
                const { error: subCommentErr } = await supabaseAdmin
                  .from('comments')
                  .insert({
                    scorecard_id: sc.id,
                    user_id: user.id,
                    user_email: user.email || '',
                    row_id: subRow.store_name, // store name as row_id for subgrid
                    parent_row_id: String(matchedRow.id), // link to parent row
                    text: commentText,
                    market_visit_id: visit.id,
                    created_at: timestamp,
                    updated_at: timestamp,
                  });
                if (subCommentErr) logger.error('Subgrid comment insert failed:', subCommentErr);
              }

              // Notify brand users assigned to this scorecard
              const { data: assignments } = await supabaseAdmin
                .from('brand_user_assignments')
                .select('user_id')
                .eq('scorecard_id', sc.id);

              if (assignments && assignments.length > 0 && comment) {
                const rowName = matchedRow.name || `Row ${matchedRow.id}`;
                const message = `${adminName} added a market visit note on ${rowName} in ${sc.title}`;
                const notifs = assignments.map((a: { user_id: string }) => ({
                  recipient_role: 'BRAND',
                  recipient_user_id: a.user_id,
                  actor_user_id: user.id,
                  actor_name: adminName,
                  action_type: 'market_visit_comment_added',
                  scorecard_id: sc.id,
                  scorecard_name: sc.title,
                  row_id: String(matchedRow.id),
                  row_name: rowName,
                  store_name: storeName,
                  comment_id: comment.id,
                  message,
                  is_read: false,
                }));
                const { error: notifErr } = await supabaseAdmin.from('notifications').insert(notifs);
                if (notifErr) logger.error('Market visit notification failed:', notifErr);
              }
            }
          }
        }
      } catch (autoCommentErr) {
        // Non-fatal — don't fail the visit upload
        logger.error('Auto-comment from market visit failed:', autoCommentErr);
      }
    }

    const signedUrl = await signPhoto(storagePath);
    return NextResponse.json({ ...visit, photo_url: signedUrl ?? visit.photo_url }, { status: 201 });
  } catch (err) {
    logger.error('Market visit POST failed:', err);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}

// GET /api/market-visits — list visits with optional filters (admin only,
// cross-admin visibility so all admins see team-wide market visits)
export async function GET(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.user_metadata?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);

    const brand = searchParams.get('brand');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('market_visits')
      .select('*', { count: 'exact' })
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (brand) {
      query = query.contains('brands', [brand]);
    }
    if (dateFrom) {
      query = query.gte('visit_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('visit_date', dateTo);
    }
    if (search) {
      const like = `%${search.replace(/[%_]/g, m => `\\${m}`)}%`;
      query = query.or(`store_name.ilike.${like},note.ilike.${like},address.ilike.${like}`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      logger.error('Market visit GET failed:', error);
      return NextResponse.json({ error: 'Failed to load visits' }, { status: 500 });
    }

    // Resolve signed URLs in parallel — photos are stored in a private bucket
    const withSignedUrls = await Promise.all(
      (data || []).map(async v => ({
        ...v,
        photo_url: (await signPhoto(v.photo_storage_path)) ?? v.photo_url,
      })),
    );

    return NextResponse.json({ data: withSignedUrls, count, page, limit });
  } catch (err) {
    logger.error('Market visit GET failed:', err);
    return NextResponse.json({ error: 'Failed to load visits' }, { status: 500 });
  }
}
