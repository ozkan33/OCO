import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BUCKET = 'client-logos';
const VALID_KINDS = new Set(['brand', 'retailer']);

function normalizeKind(raw: string | null | undefined): 'brand' | 'retailer' | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  return VALID_KINDS.has(k) ? (k as 'brand' | 'retailer') : null;
}

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

// GET /api/client-logos[?kind=brand|retailer] — list logos (public)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const kind = normalizeKind(kindParam);

  let query = supabaseAdmin
    .from('client_logos')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/client-logos — upload a new logo (admin only)
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const label = formData.get('label') as string | null;
    const sortOrder = formData.get('sort_order') as string | null;
    const kind = normalizeKind(formData.get('kind') as string | null) ?? 'brand';
    const websiteUrl = normalizeUrl(formData.get('website_url') as string | null);

    if (!label || !label.trim()) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 });
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 });
    }

    const mimeType = file.type.toLowerCase();
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed' }, { status: 400 });
    }

    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
    const rawExt = file.name.split('.').pop()?.toLowerCase() || '';
    const ext = ALLOWED_EXTENSIONS.includes(rawExt) ? rawExt : 'jpg';
    const storagePath = `${kind}/${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType: mimeType,
        cacheControl: '31536000',
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const { data: logo, error: dbError } = await supabaseAdmin
      .from('client_logos')
      .insert({
        label: label.trim(),
        image_url: urlData.publicUrl,
        storage_path: storagePath,
        sort_order: sortOrder ? parseInt(sortOrder, 10) : 0,
        kind,
        website_url: websiteUrl,
      })
      .select()
      .single();

    if (dbError) {
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json(logo, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// PUT /api/client-logos — seed logos from URL (no file upload, admin only)
export async function PUT(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const logos: { label: string; image_url: string; sort_order?: number; kind?: string; website_url?: string }[] = body.logos;

    if (!Array.isArray(logos) || logos.length === 0) {
      return NextResponse.json({ error: 'logos array is required' }, { status: 400 });
    }

    // Upsert by (kind, label) so re-running the seed is idempotent — existing
    // rows are skipped rather than duplicated or overwritten.
    const { data, error } = await supabaseAdmin
      .from('client_logos')
      .upsert(
        logos.map((l, i) => ({
          label: l.label,
          image_url: l.image_url,
          sort_order: l.sort_order ?? i,
          kind: normalizeKind(l.kind) ?? 'brand',
          website_url: normalizeUrl(l.website_url),
        })),
        { onConflict: 'kind,label', ignoreDuplicates: true }
      )
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
