export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ address: string; storeName?: string } | null> {
  try {
    const res = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
    });
    if (!res.ok) {
      console.warn('Reverse geocode failed:', res.status);
      return null;
    }
    const data = await res.json();
    return {
      address: data.address || data.fullAddress || null,
      storeName: data.storeName || undefined,
    };
  } catch (err) {
    console.warn('Reverse geocode error:', err);
    return null;
  }
}
