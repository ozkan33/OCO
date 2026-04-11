import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

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
