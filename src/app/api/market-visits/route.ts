import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { logger } from '../../../../lib/logger';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// POST /api/market-visits — upload a visit photo
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const formData = await request.formData();

    const file = formData.get('file') as File | null;
    const visitDate = formData.get('visit_date') as string | null;
    const latitude = formData.get('latitude') as string | null;
    const longitude = formData.get('longitude') as string | null;
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
      // Validate against scorecards in the database
      const { data: scorecards } = await supabaseAdmin
        .from('user_scorecards')
        .select('title');
      const validBrands = new Set((scorecards || []).map((s: any) => s.title));
      const invalid = brands.filter(b => !validBrands.has(b));
      if (invalid.length > 0) {
        return NextResponse.json({ error: `Unknown brands: ${invalid.join(', ')}` }, { status: 400 });
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

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('market-photos')
      .getPublicUrl(storagePath);

    // Insert database row — sanitize numeric fields to avoid NaN
    const parsedLat = latitude ? parseFloat(latitude) : null;
    const parsedLng = longitude ? parseFloat(longitude) : null;
    const { data: visit, error: dbError } = await supabaseAdmin
      .from('market_visits')
      .insert({
        user_id: user.id,
        photo_url: urlData.publicUrl,
        photo_storage_path: storagePath,
        visit_date: visitDate,
        latitude: parsedLat !== null && !isNaN(parsedLat) ? parsedLat : null,
        longitude: parsedLng !== null && !isNaN(parsedLng) ? parsedLng : null,
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
          // Normalize: lowercase, collapse whitespace, remove spaces around & and special chars
          const normalize = (s: string) => s.trim().toLowerCase().replace(/\s*&\s*/g, '&').replace(/\s+/g, ' ');
          const normalizedStore = normalize(storeName);
          const adminName = user.user_metadata?.name || user.email?.split('@')[0] || 'Admin';
          const timestamp = new Date().toISOString();

          for (const sc of matchedScorecards) {
            const rows = sc.data?.rows || [];

            // 1) Prefer a subgrid-row match (specific store like "CUB SHOREWOOD" → its parent chain "CUB FOODS")
            let matchedRow: any = null;
            let matchedSubRow: any = null;
            for (const r of rows) {
              const subRows = r?.subgrid?.rows;
              if (!Array.isArray(subRows)) continue;
              const sub = subRows.find((sr: any) => {
                const subName = normalize(String(sr.store_name || ''));
                if (!subName) return false;
                return subName === normalizedStore || subName.includes(normalizedStore) || normalizedStore.includes(subName);
              });
              if (sub) {
                matchedRow = r;
                matchedSubRow = sub;
                break;
              }
            }

            // 2) Fall back to matching against top-level chain row names (e.g., user typed "CUB FOODS")
            if (!matchedRow) {
              matchedRow = rows.find((r: any) => {
                const rowName = normalize(String(r.name || ''));
                if (!rowName) return false;
                return rowName === normalizedStore || rowName.includes(normalizedStore) || normalizedStore.includes(rowName);
              });
            }

            if (matchedRow) {
              // Insert comment on the matched row
              const commentText = `[Market Visit — ${visitDate}] ${note}`;
              const { data: comment, error: commentErr } = await supabaseAdmin
                .from('comments')
                .insert({
                  scorecard_id: sc.id,
                  user_id: user.id,
                  user_email: user.email || '',
                  row_id: String(matchedRow.id),
                  text: commentText,
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
              // Otherwise (chain-level match), comment on every subgrid row that matches the typed name.
              const subRowsToComment: any[] = matchedSubRow
                ? [matchedSubRow]
                : (matchedRow.subgrid?.rows || []).filter((subRow: any) => {
                    const subStoreName = normalize(String(subRow.store_name || ''));
                    return subStoreName && (
                      subStoreName === normalizedStore ||
                      subStoreName.includes(normalizedStore) ||
                      normalizedStore.includes(subStoreName)
                    );
                  });

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
                  action_type: 'comment_added',
                  scorecard_id: sc.id,
                  scorecard_name: sc.title,
                  row_id: String(matchedRow.id),
                  row_name: rowName,
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

    return NextResponse.json(visit, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// GET /api/market-visits — list visits with optional filters
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const { searchParams } = new URL(request.url);

    const brand = searchParams.get('brand');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('market_visits')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
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

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, count, page, limit });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
