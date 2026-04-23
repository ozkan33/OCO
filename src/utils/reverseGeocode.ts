export interface AddressDetails {
  house_number: string | null;
  road: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
}

export interface ReverseGeocodeResult {
  address: string;
  storeName?: string;
  details?: AddressDetails;
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
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
      details: data.details || undefined,
    };
  } catch (err) {
    console.warn('Reverse geocode error:', err);
    return null;
  }
}
