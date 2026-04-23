import { supabaseAdmin } from './supabaseAdmin';

export interface ChainStoreRow {
  chain_name: string | null;
  store_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
}

// Module-level cache survives within a serverless instance. The store list
// is large and changes rarely (admins import bulk CSVs), so re-fetching it
// on every keystroke / GPS lookup would waste DB bandwidth.
let cache: { stores: ChainStoreRow[]; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function loadAllChainStores(): Promise<ChainStoreRow[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.stores;
  }
  const PAGE = 1000;
  const stores: ChainStoreRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('chain_stores')
      .select('chain_name, store_name, address, city, state, zipcode')
      .order('store_name', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    stores.push(...(data as ChainStoreRow[]));
    if (data.length < PAGE) break;
  }
  cache = { stores, ts: Date.now() };
  return stores;
}

export function buildAddress(s: ChainStoreRow): string {
  const street = s.address?.trim() || '';
  const city = s.city?.trim() || '';
  const state = s.state?.trim() || '';
  const zip = s.zipcode?.trim() || '';
  const cityState = [city, state].filter(Boolean).join(', ');
  const tail = [cityState, zip].filter(Boolean).join(' ');
  return [street, tail].filter(Boolean).join(', ');
}
