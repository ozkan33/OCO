import { NextResponse } from 'next/server';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { loadAllChainStores, buildAddress } from '../../../../../lib/chainStoresCache';
import { matchChain, strictKey } from '@/components/admin/chainNameUtils';

// GET /api/stores/match-store-name?q=...
// Mirrors the scorecard "Chain Name" matcher but for chain_stores.store_name.
// Returns the match kind plus the canonical store record (with combined
// address) so the market-visit form can both notify the user about
// unrecognized names and auto-fill the address as a fallback.
export async function GET(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.user_metadata?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) {
    return NextResponse.json({ match: { kind: 'empty' }, store: null });
  }

  let stores;
  try {
    stores = await loadAllChainStores();
  } catch {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  const seen = new Set<string>();
  const distinctNames: string[] = [];
  for (const s of stores) {
    const name = (s.store_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distinctNames.push(name);
  }

  const match = matchChain(q, distinctNames);

  let canonical: string | null = null;
  if (match.kind === 'exact' || match.kind === 'normalized') {
    canonical = match.canonical;
  } else if (match.kind === 'prefix' || match.kind === 'fuzzy') {
    canonical = match.suggestion;
  }

  let store: {
    chain_name: string | null;
    store_name: string | null;
    address: string;
    rawAddress: string | null;
    city: string | null;
    state: string | null;
    zipcode: string | null;
  } | null = null;

  if (canonical) {
    const key = strictKey(canonical);
    const found = stores.find((s) => strictKey(s.store_name || '') === key);
    if (found) {
      store = {
        chain_name: found.chain_name,
        store_name: found.store_name,
        address: buildAddress(found),
        rawAddress: found.address,
        city: found.city,
        state: found.state,
        zipcode: found.zipcode,
      };
    }
  }

  return NextResponse.json({ match, store });
}
