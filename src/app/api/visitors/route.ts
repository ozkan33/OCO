import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';

// POST /api/visitors — record a page visit (public, no auth required)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pageUrl, referrer, utmSource, utmMedium, utmCampaign, sessionId } = body;

    // Parse user agent
    const userAgent = request.headers.get('user-agent') || '';
    const deviceType = /mobile/i.test(userAgent) ? 'mobile' : /tablet|ipad/i.test(userAgent) ? 'tablet' : 'desktop';
    const browser = parseBrowser(userAgent);
    const os = parseOS(userAgent);

    // Get IP from headers (works behind most proxies/CDNs)
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || '';

    // Geo lookup via IP (best-effort, non-blocking)
    let country = '', city = '', region = '';
    if (ip && ip !== '127.0.0.1' && ip !== '::1') {
      try {
        const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2000) });
        if (geoRes.ok) {
          const geo = await geoRes.json();
          country = geo.country_name || '';
          city = geo.city || '';
          region = geo.region || '';
        }
      } catch { /* geo lookup failed, continue without it */ }
    }

    // Check if this session already visited (for unique tracking)
    let isUnique = true;
    if (sessionId) {
      const { count } = await supabaseAdmin
        .from('site_visitors')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId);
      isUnique = (count || 0) === 0;
    }

    const { error } = await supabaseAdmin.from('site_visitors').insert({
      page_url: pageUrl || '/',
      referrer: referrer || null,
      ip_address: ip || null,
      country, city, region,
      user_agent: userAgent.substring(0, 500),
      device_type: deviceType,
      browser, os,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      session_id: sessionId || null,
      is_unique: isUnique,
    });

    if (error) {
      console.error('Visitor tracking error:', error.message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// GET /api/visitors — admin-only: fetch visitor analytics
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Fetch recent visitors
    const { data: visitors, error } = await supabaseAdmin
      .from('site_visitors')
      .select('*')
      .gte('visited_at', since)
      .order('visited_at', { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Compute summary stats
    const records = visitors || [];
    const totalVisits = records.length;
    const uniqueVisits = records.filter(v => v.is_unique).length;

    // Top referrers
    const refCounts: Record<string, number> = {};
    for (const v of records) {
      const ref = v.referrer ? new URL(v.referrer).hostname : 'Direct';
      refCounts[ref] = (refCounts[ref] || 0) + 1;
    }
    const topReferrers = Object.entries(refCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    // Top pages
    const pageCounts: Record<string, number> = {};
    for (const v of records) {
      pageCounts[v.page_url] = (pageCounts[v.page_url] || 0) + 1;
    }
    const topPages = Object.entries(pageCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([page, count]) => ({ page, count }));

    // Device breakdown
    const deviceCounts: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
    for (const v of records) {
      deviceCounts[v.device_type || 'desktop']++;
    }

    // Country breakdown
    const countryCounts: Record<string, number> = {};
    for (const v of records) {
      const c = v.country || 'Unknown';
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    }
    const topCountries = Object.entries(countryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }));

    // Daily visits for chart
    const dailyMap: Record<string, { total: number; unique: number }> = {};
    for (const v of records) {
      const day = v.visited_at.split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = { total: 0, unique: 0 };
      dailyMap[day].total++;
      if (v.is_unique) dailyMap[day].unique++;
    }
    const dailyVisits = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    return NextResponse.json({
      totalVisits,
      uniqueVisits,
      topReferrers,
      topPages,
      deviceCounts,
      topCountries,
      dailyVisits,
      recentVisitors: records.slice(0, 50),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

function parseBrowser(ua: string): string {
  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/msie|trident/i.test(ua)) return 'IE';
  return 'Other';
}

function parseOS(ua: string): string {
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac os/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua) && !/android/i.test(ua)) return 'Linux';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad/i.test(ua)) return 'iOS';
  return 'Other';
}
