import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

// PUT /api/market-visits/[id] - Update visit metadata
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    const { id } = await params;

    const { data: visit } = await supabaseAdmin
      .from('market_visits')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!visit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (visit.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const updates: Record<string, any> = {};
    if (body.store_name !== undefined) updates.store_name = body.store_name;
    if (body.address !== undefined) updates.address = body.address;
    if (body.visit_date !== undefined) updates.visit_date = body.visit_date;
    if (body.note !== undefined) updates.note = body.note;
    if (body.brands !== undefined) updates.brands = body.brands;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('market_visits')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/market-visits/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    const { id } = await params;

    // Fetch the visit (verify ownership)
    const { data: visit, error: fetchError } = await supabaseAdmin
      .from('market_visits')
      .select('id, user_id, photo_storage_path')
      .eq('id', id)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (visit.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete from storage
    await supabaseAdmin.storage
      .from('market-photos')
      .remove([visit.photo_storage_path]);

    // Delete database row
    const { error: deleteError } = await supabaseAdmin
      .from('market_visits')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
