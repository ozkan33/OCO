import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';

// GET /api/stores?chain=CubFoods — get stores by chain name
export async function GET(request: Request) {
  try {
    await getUserFromToken(request);
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get('chain');

    if (!chain) {
      return NextResponse.json({ error: 'chain parameter is required' }, { status: 400 });
    }

    // Try exact match first, then partial match if no results
    let { data, error } = await supabaseAdmin
      .from('chain_stores')
      .select('id, chain_name, store_name, address, city, state, zipcode')
      .ilike('chain_name', chain)
      .order('store_name');

    // If no exact match, try partial match (e.g. "WALGREENS" matches "WALGREENS #3698-1208778")
    if (!error && (!data || data.length === 0)) {
      ({ data, error } = await supabaseAdmin
        .from('chain_stores')
        .select('id, chain_name, store_name, address, city, state, zipcode')
        .ilike('chain_name', `${chain}%`)
        .order('store_name'));
    }

    // If still no match, try contains match
    if (!error && (!data || data.length === 0)) {
      ({ data, error } = await supabaseAdmin
        .from('chain_stores')
        .select('id, chain_name, store_name, address, city, state, zipcode')
        .ilike('chain_name', `%${chain}%`)
        .order('store_name'));
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/stores — import Excel data (admin only)
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);

    // Check admin role
    const role = user.user_metadata?.role || '';
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { stores } = body;

    if (!Array.isArray(stores) || stores.length === 0) {
      return NextResponse.json({ error: 'stores array is required' }, { status: 400 });
    }

    // Cap at 50,000 rows to prevent excessive database inserts
    if (stores.length > 50_000) {
      return NextResponse.json({ error: `Too many stores (${stores.length}). Maximum is 50,000.` }, { status: 400 });
    }

    // Insert in batches of 500
    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < stores.length; i += BATCH_SIZE) {
      const batch = stores.slice(i, i + BATCH_SIZE).map((s: any) => ({
        chain_name: String(s.chain_name || '').trim(),
        store_name: String(s.store_name || '').trim(),
        address: String(s.address || '').trim() || null,
        city: String(s.city || '').trim() || null,
        state: String(s.state || '').trim() || null,
        zipcode: String(s.zipcode || '').trim() || null,
      })).filter((s: any) => s.chain_name && s.store_name);

      if (batch.length > 0) {
        const { error } = await supabaseAdmin.from('chain_stores').insert(batch);
        if (error) {
          return NextResponse.json({ error: `Batch insert failed at row ${i}: ${error.message}` }, { status: 500 });
        }
        inserted += batch.length;
      }
    }

    return NextResponse.json({ message: `Imported ${inserted} stores`, count: inserted }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/stores — clear all chain stores (admin only, for re-import)
export async function DELETE(request: Request) {
  try {
    const user = await getUserFromToken(request);

    const role = user.user_metadata?.role || '';
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('chain_stores')
      .delete()
      .neq('id', 0); // delete all rows

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'All chain stores deleted' });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
