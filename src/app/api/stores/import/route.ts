import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { parseSpreadsheetToRows, UnsupportedXlsError } from '@/lib/spreadsheetImport';

// POST /api/stores/import — upload Excel file and import chain stores
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);

    const role = user.user_metadata?.role || '';
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const clearExisting = formData.get('clear_existing') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'Excel file is required' }, { status: 400 });
    }

    // Limit file size to 20MB to prevent memory exhaustion via crafted XLSX
    const MAX_XLSX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_XLSX_SIZE) {
      return NextResponse.json({ error: 'Excel file must be under 20MB' }, { status: 400 });
    }

    // Parse Excel
    const buffer = await file.arrayBuffer();
    const rows = await parseSpreadsheetToRows(buffer, file.name);

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Excel file must have a header row and data' }, { status: 400 });
    }

    // Expected headers: Chain Name, Store Name, Address, City, State, ZIP, ...
    const headers = rows[0].map((h: any) => String(h).trim().toLowerCase());
    const chainIdx = headers.findIndex((h: string) => h.includes('chain'));
    const storeIdx = headers.findIndex((h: string) => h.includes('store'));
    const addressIdx = headers.findIndex((h: string) => h === 'address');
    const cityIdx = headers.findIndex((h: string) => h === 'city');
    const stateIdx = headers.findIndex((h: string) => h === 'state');
    const zipIdx = headers.findIndex((h: string) => h === 'zip' || h === 'zipcode');

    if (chainIdx === -1 || storeIdx === -1) {
      return NextResponse.json({ error: 'Excel must have "Chain Name" and "Store Name" columns' }, { status: 400 });
    }

    // Parse all data rows
    const stores: { chain_name: string; store_name: string; address: string | null; city: string | null; state: string | null; zipcode: string | null }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const chainName = String(row[chainIdx] || '').trim();
      const storeName = String(row[storeIdx] || '').trim();

      if (!storeName) continue; // skip empty store names

      // If chain name is empty, use store name as chain name (single-store chain)
      const effectiveChain = chainName || storeName;

      stores.push({
        chain_name: effectiveChain,
        store_name: storeName,
        address: addressIdx >= 0 ? String(row[addressIdx] || '').trim() || null : null,
        city: cityIdx >= 0 ? String(row[cityIdx] || '').trim() || null : null,
        state: stateIdx >= 0 ? String(row[stateIdx] || '').trim() || null : null,
        zipcode: zipIdx >= 0 ? String(row[zipIdx] || '').trim() || null : null,
      });
    }

    if (stores.length === 0) {
      return NextResponse.json({ error: 'No valid store data found in Excel' }, { status: 400 });
    }

    // Cap at 50,000 rows to prevent excessive database inserts
    const MAX_ROWS = 50_000;
    if (stores.length > MAX_ROWS) {
      return NextResponse.json({ error: `Too many rows (${stores.length}). Maximum is ${MAX_ROWS}.` }, { status: 400 });
    }

    // Optionally clear existing data
    if (clearExisting) {
      await supabaseAdmin.from('chain_stores').delete().neq('id', 0);
    }

    // Insert in batches of 500
    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < stores.length; i += BATCH_SIZE) {
      const batch = stores.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin.from('chain_stores').insert(batch);
      if (error) {
        return NextResponse.json({
          error: `Batch insert failed at row ${i}: ${error.message}`,
          inserted_so_far: inserted,
        }, { status: 500 });
      }
      inserted += batch.length;
    }

    return NextResponse.json({
      message: `Imported ${inserted} stores`,
      count: inserted,
      chains: new Set(stores.map(s => s.chain_name)).size,
    }, { status: 201 });
  } catch (err: any) {
    if (err?.message === 'No token found' || err?.message === 'Invalid token') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err instanceof UnsupportedXlsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
