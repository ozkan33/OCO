import type { ChainMatch } from '@/components/admin/chainNameUtils';

export interface StoreLookup {
  chain_name: string | null;
  store_name: string | null;
  address: string;
  rawAddress: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
}

export interface StoreLookupResult {
  match: ChainMatch;
  store: StoreLookup | null;
}

export async function lookupStoreByName(name: string): Promise<StoreLookupResult | null> {
  const q = (name || '').trim();
  if (!q) return null;
  try {
    const res = await fetch(`/api/stores/match-store-name?q=${encodeURIComponent(q)}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== 'object' || !json.match) return null;
    return { match: json.match as ChainMatch, store: (json.store as StoreLookup) || null };
  } catch {
    return null;
  }
}
