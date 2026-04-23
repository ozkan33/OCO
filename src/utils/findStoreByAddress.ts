import type { StoreLookup } from './lookupStoreByName';
import type { AddressDetails } from './reverseGeocode';

// Asks the server to fuzzy-match Nominatim's structured address against
// chain_stores. Returns the canonical store record (with assembled address)
// only when the server's confidence crosses its threshold — null otherwise so
// callers can fall through to other heuristics (prior-visit lookup, raw
// Nominatim output).
export async function findStoreByAddress(
  details: AddressDetails,
): Promise<StoreLookup | null> {
  if (!details || (!details.road && !details.city && !details.postcode)) return null;
  try {
    const res = await fetch('/api/stores/match-by-address', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        road: details.road,
        city: details.city,
        state: details.state,
        postcode: details.postcode,
        house_number: details.house_number,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.store as StoreLookup) || null;
  } catch {
    return null;
  }
}
