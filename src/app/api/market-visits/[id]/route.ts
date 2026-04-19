import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';

async function authorizeAdmin(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'ADMIN') {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { user };
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
}

// PUT /api/market-visits/[id] - Update visit metadata
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;

    const { data: visit } = await supabaseAdmin
      .from('market_visits')
      .select('id')
      .eq('id', id)
      .single();

    if (!visit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const updates: Record<string, any> = {};
    if (body.store_name !== undefined) updates.store_name = body.store_name;
    if (body.address !== undefined) updates.address = body.address;
    if (body.visit_date !== undefined) {
      if (typeof body.visit_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.visit_date)) {
        return NextResponse.json({ error: 'Invalid visit_date (YYYY-MM-DD)' }, { status: 400 });
      }
      updates.visit_date = body.visit_date;
    }
    if (body.note !== undefined) updates.note = body.note;
    if (body.brands !== undefined) {
      if (!Array.isArray(body.brands) || body.brands.length === 0) {
        return NextResponse.json({ error: 'At least one brand is required' }, { status: 400 });
      }
      updates.brands = body.brands;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('market_visits')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Market visit update failed:', error);
      return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 });
    }

    // Sync note changes to auto-generated comments linked by market_visit_id.
    // Using the id avoids the same-day prefix-match bug where two visits on
    // the same date clobbered each other's auto-comment text.
    if (body.note !== undefined) {
      try {
        const newText = `[Market Visit — ${updated.visit_date} · ${updated.store_name || ''}] ${body.note}`;
        const { error: syncErr } = await supabaseAdmin
          .from('comments')
          .update({ text: newText, updated_at: new Date().toISOString() })
          .eq('market_visit_id', id);

        if (syncErr) logger.error('Comment sync failed:', syncErr);
      } catch (syncErr) {
        logger.error('Comment sync error:', syncErr);
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    logger.error('Market visit PUT failed:', err);
    return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 });
  }
}

// DELETE /api/market-visits/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;

    // Fetch the visit
    const { data: visit, error: fetchError } = await supabaseAdmin
      .from('market_visits')
      .select('id, photo_storage_path')
      .eq('id', id)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
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
      logger.error('Market visit delete failed:', deleteError);
      return NextResponse.json({ error: 'Failed to delete visit' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Market visit DELETE failed:', err);
    return NextResponse.json({ error: 'Failed to delete visit' }, { status: 500 });
  }
}
