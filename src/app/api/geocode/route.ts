import { NextResponse } from 'next/server';
import { getUserFromToken } from '../../../../lib/apiAuth';

// POST /api/geocode — reverse geocode lat/lng to an address (server-side to avoid CORS)
export async function POST(request: Request) {
  try {
    await getUserFromToken(request); // auth check — prevent unauthenticated abuse
    const { lat, lng } = await request.json();

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'lat and lng are required numbers' }, { status: 400 });
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': '3BrothersMarketing/2.0 (volkan@3brothersmarketing.com)',
          'Accept-Language': 'en',
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'Geocoding service unavailable' }, { status: 502 });
    }

    const data = await res.json();

    if (!data.display_name) {
      return NextResponse.json({ error: 'No address found for these coordinates' }, { status: 404 });
    }

    // Build a cleaner short address from the structured data
    const addr = data.address || {};
    const parts = [
      addr.house_number,
      addr.road,
      addr.city || addr.town || addr.village || addr.hamlet,
      addr.state,
      addr.postcode,
    ].filter(Boolean);

    return NextResponse.json({
      address: parts.length >= 2 ? parts.join(', ') : data.display_name,
      fullAddress: data.display_name,
      storeName: addr.shop || addr.supermarket || addr.retail || addr.building || null,
    });
  } catch (err: any) {
    if (err?.message === 'No token found' || err?.message === 'Invalid token') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 });
  }
}
