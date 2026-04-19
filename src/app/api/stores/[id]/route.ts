import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

// PATCH /api/stores/[id] — update a single store row (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);

    const role = user.user_metadata?.role || '';
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ error: 'Invalid store id' }, { status: 400 });
    }

    const body = await request.json();

    const updates: Record<string, string | null> = {};
    if (typeof body.chain_name === 'string') {
      const v = body.chain_name.trim();
      if (!v) return NextResponse.json({ error: 'chain_name cannot be empty' }, { status: 400 });
      updates.chain_name = v;
    }
    if (typeof body.store_name === 'string') {
      const v = body.store_name.trim();
      if (!v) return NextResponse.json({ error: 'store_name cannot be empty' }, { status: 400 });
      updates.store_name = v;
    }
    for (const field of ['address', 'city', 'state', 'zipcode'] as const) {
      if (field in body) {
        const raw = body[field];
        updates[field] = raw == null ? null : String(raw).trim() || null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('chain_stores')
      .update(updates)
      .eq('id', storeId)
      .select('id, chain_name, store_name, address, city, state, zipcode')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    return NextResponse.json({ store: data });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/stores/[id] — delete a single store row (admin only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);

    const role = user.user_metadata?.role || '';
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ error: 'Invalid store id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('chain_stores')
      .delete()
      .eq('id', storeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
