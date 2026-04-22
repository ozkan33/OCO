import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

const BUCKET = 'client-logos';

function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
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

// PUT /api/client-logos/:id — update label, sort order, or website URL
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.label !== undefined) updates.label = String(body.label).trim();
    if (body.sort_order !== undefined) updates.sort_order = parseInt(body.sort_order, 10);
    if (body.website_url !== undefined) {
      // Empty string / null → clear the URL; otherwise validate.
      if (body.website_url === null || body.website_url === '') {
        updates.website_url = null;
      } else {
        const normalized = normalizeUrl(body.website_url);
        if (!normalized) {
          return NextResponse.json({ error: 'Invalid website URL' }, { status: 400 });
        }
        updates.website_url = normalized;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('client_logos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/client-logos/:id — remove a logo (admin only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const { id } = await params;

    // Fetch the logo to get storage path
    const { data: logo, error: fetchError } = await supabaseAdmin
      .from('client_logos')
      .select('storage_path')
      .eq('id', id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: 'Logo not found' }, { status: 404 });
    }

    // Delete from database
    const { error: dbError } = await supabaseAdmin
      .from('client_logos')
      .delete()
      .eq('id', id);

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Delete from storage if path exists
    if (logo.storage_path) {
      await supabaseAdmin.storage.from(BUCKET).remove([logo.storage_path]);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
