import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { BRANDS } from '@/constants/brands';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

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
    const mimeType = file.type.toLowerCase();
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP and HEIC images are allowed' }, { status: 400 });
    }

    // Validate date
    if (!visitDate) {
      return NextResponse.json({ error: 'Visit date is required' }, { status: 400 });
    }

    // Validate brands
    let brands: string[] = [];
    if (brandsRaw) {
      try {
        brands = JSON.parse(brandsRaw);
      } catch {
        return NextResponse.json({ error: 'Invalid brands format' }, { status: 400 });
      }
      const invalid = brands.filter(b => !(BRANDS as readonly string[]).includes(b));
      if (invalid.length > 0) {
        return NextResponse.json({ error: `Unknown brands: ${invalid.join(', ')}` }, { status: 400 });
      }
    }
    if (brands.length === 0) {
      return NextResponse.json({ error: 'At least one brand is required' }, { status: 400 });
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from('market-photos')
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType: mimeType,
        cacheControl: '3600',
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('market-photos')
      .getPublicUrl(storagePath);

    // Insert database row
    const { data: visit, error: dbError } = await supabaseAdmin
      .from('market_visits')
      .insert({
        user_id: user.id,
        photo_url: urlData.publicUrl,
        photo_storage_path: storagePath,
        visit_date: visitDate,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        address: address || null,
        store_name: storeName || null,
        note: note || null,
        brands,
      })
      .select()
      .single();

    if (dbError) {
      // Clean up uploaded file on DB failure
      await supabaseAdmin.storage.from('market-photos').remove([storagePath]);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
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
