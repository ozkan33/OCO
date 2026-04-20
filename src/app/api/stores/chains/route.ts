import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

// GET /api/stores/chains — returns distinct chain names from chain_stores.
// Any authenticated user can read the canonical chain list (used for
// validation/autocomplete in admin Mastercard grid).
export async function GET(request: Request) {
  try {
    await getUserFromToken(request);

    // Paginate through chain_stores — PostgREST caps responses at ~1000
    // rows by default, which would drop chain_names alphabetically past the
    // cut-off and silently break autocomplete/fuzzy-match validation.
    const PAGE = 1000;
    const rows: { chain_name: string | null }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('chain_stores')
        .select('chain_name')
        .order('chain_name', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    const seen = new Set<string>();
    const chains: string[] = [];
    for (const row of rows) {
      const name = (row.chain_name || '').trim();
      if (!name) continue;
      const key = name.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      chains.push(name);
    }

    return NextResponse.json({ chains });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
