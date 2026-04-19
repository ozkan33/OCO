// Find a previously-visited store near the given coords. GPS from "use
// current location" can drift to a neighboring house number, so exact-address
// matching would miss — this is a proximity lookup against past visits.
export async function findNearbyStore(
  lat: number,
  lng: number,
): Promise<{ storeName: string; distanceM: number } | null> {
  try {
    const res = await fetch(
      `/api/market-visits/nearby-store?lat=${lat}&lng=${lng}`,
      { credentials: 'include' },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.storeName) return null;
    return { storeName: data.storeName, distanceM: data.distanceM ?? 0 };
  } catch {
    return null;
  }
}
