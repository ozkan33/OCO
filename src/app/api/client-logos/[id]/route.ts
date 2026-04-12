import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

const BUCKET = 'client-logos';

// PUT /api/client-logos/:id — update label or sort order
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getUserFromToken(request);
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.label !== undefined) updates.label = body.label.trim();
    if (body.sort_order !== undefined) updates.sort_order = parseInt(body.sort_order, 10);

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

// DELETE /api/client-logos/:id — remove a logo
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getUserFromToken(request);
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
