import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

const BUCKET = 'client-logos';

function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
    return u.toString();
  } catch {
    throw new Error('Invalid website URL');
  }
}

// PUT /api/client-logos/:id — update label or sort order
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
    if (body.label !== undefined) updates.label = body.label.trim();
    if (body.sort_order !== undefined) updates.sort_order = parseInt(body.sort_order, 10);
    if (body.website_url !== undefined) {
      try {
        updates.website_url = normalizeWebsiteUrl(body.website_url);
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
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
