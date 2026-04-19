import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';

// GET /api/stores
//   ?chain=CubFoods           — lookup stores by chain name (any authenticated user)
//   ?all=1&q=...&page=1&pageSize=50
//                             — admin-only paginated listing (used by /admin/stores)
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get('chain');
    const all = searchParams.get('all');

    if (all) {
      const role = user.user_metadata?.role || '';
      if (role !== 'ADMIN') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }

      const q = (searchParams.get('q') || '').trim();
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
      const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get('pageSize') || '100', 10) || 100));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from('chain_stores')
        .select('id, chain_name, store_name, address, city, state, zipcode', { count: 'exact' });

      if (q) {
        const safe = q.replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(
          `chain_name.ilike.%${safe}%,store_name.ilike.%${safe}%,city.ilike.%${safe}%,state.ilike.%${safe}%,zipcode.ilike.%${safe}%`
        );
      }

      const { data, error, count } = await query
        .order('chain_name', { ascending: true })
        .order('store_name', { ascending: true })
        .range(from, to);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        stores: data || [],
        total: count || 0,
        page,
        pageSize,
      });
    }

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

// POST /api/stores
//   body: { store: {...} }   — admin creates a single store
//   body: { stores: [...] }  — admin bulk-inserts (used by programmatic flows)
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);

    const role = user.user_metadata?.role || '';
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    if (body.store && typeof body.store === 'object') {
      const s = body.store;
      const chain_name = String(s.chain_name || '').trim();
      const store_name = String(s.store_name || '').trim();
      if (!chain_name || !store_name) {
        return NextResponse.json({ error: 'chain_name and store_name are required' }, { status: 400 });
      }
      const row = {
        chain_name,
        store_name,
        address: String(s.address || '').trim() || null,
        city: String(s.city || '').trim() || null,
        state: String(s.state || '').trim() || null,
        zipcode: String(s.zipcode || '').trim() || null,
      };
      const { data, error } = await supabaseAdmin
        .from('chain_stores')
        .insert(row)
        .select('id, chain_name, store_name, address, city, state, zipcode')
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ store: data }, { status: 201 });
    }

    const stores = body.stores;
    if (!Array.isArray(stores) || stores.length === 0) {
      return NextResponse.json({ error: 'stores array or store object is required' }, { status: 400 });
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
