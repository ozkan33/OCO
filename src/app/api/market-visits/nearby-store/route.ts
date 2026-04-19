import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';

// GET /api/market-visits/nearby-store?lat=..&lng=..&radius_m=..
// Finds the closest previously-visited store (by any admin) within radius.
// Used to auto-populate store_name after "Use my current location" — GPS often
// lands on a neighboring house number so an exact address match wouldn't work,
// but a proximity match against prior visits will.
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
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const radiusM = Math.min(
    Math.max(parseFloat(searchParams.get('radius_m') || '120'), 10),
    500,
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng are required numbers' }, { status: 400 });
  }

  // Bounding box prefilter — avoids scanning every historical visit.
  // 1 degree of latitude ≈ 111_320 m; longitude depends on latitude.
  const latDelta = radiusM / 111_320;
  const lngDelta = radiusM / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.000001));

  try {
    const { data, error } = await supabaseAdmin
      .from('market_visits')
      .select('store_name, latitude, longitude')
      .not('store_name', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', lat - latDelta)
      .lte('latitude', lat + latDelta)
      .gte('longitude', lng - lngDelta)
      .lte('longitude', lng + lngDelta)
      .limit(200);

    if (error) {
      logger.error('Nearby-store query failed:', error);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }

    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6_371_000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    let best: { storeName: string; distanceM: number } | null = null;
    for (const row of data || []) {
      const name = (row.store_name || '').trim();
      if (!name) continue;
      const d = haversine(lat, lng, row.latitude!, row.longitude!);
      if (d > radiusM) continue;
      if (!best || d < best.distanceM) {
        best = { storeName: name, distanceM: d };
      }
    }

    if (!best) {
      return NextResponse.json({ storeName: null, distanceM: null });
    }
    return NextResponse.json({
      storeName: best.storeName,
      distanceM: Math.round(best.distanceM),
    });
  } catch (err) {
    logger.error('Nearby-store GET failed:', err);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
