import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { logger } from '../../../../lib/logger';

// Simple in-memory rate limiter for public visitor tracking endpoint
const visitorRateLimit = new Map<string, { count: number; resetAt: number }>();
const VISITOR_RATE_MAX = 20;   // max requests per window
const VISITOR_RATE_WINDOW = 60 * 1000; // 1 minute

function isVisitorRateLimited(ip: string): boolean {
  const now = Date.now();
  // Periodic cleanup
  if (visitorRateLimit.size > 200 && Math.random() < 0.05) {
    visitorRateLimit.forEach((record, key) => {
      if (now > record.resetAt) visitorRateLimit.delete(key);
    });
  }
  const record = visitorRateLimit.get(ip);
  if (!record || now > record.resetAt) {
    visitorRateLimit.set(ip, { count: 1, resetAt: now + VISITOR_RATE_WINDOW });
    return false;
  }
  record.count += 1;
  return record.count > VISITOR_RATE_MAX;
}

// Hash visitor IP with a server-side salt so we can still enforce rate limits
// and rough geo attribution without storing PII long-term (GDPR/CCPA).
const IP_SALT = process.env.VISITOR_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'oco-fallback-salt';
function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + IP_SALT).digest('hex').slice(0, 32);
}

function safeHostname(url: string | null | undefined): string {
  if (!url) return 'Direct';
  try {
    return new URL(url).hostname || 'Direct';
  } catch {
    return 'Direct';
  }
}

// Edge headers from Vercel / Cloudflare always return 2-letter ISO codes
// ("US", "GB"), but ipapi.co's fallback returns full names ("United
// States"). We normalize everything to the full name on write so the
// dashboard doesn't show "US" and "United States" as two buckets. Names
// follow the ipapi.co spelling so the two paths stay in sync.
const ISO_TO_COUNTRY_NAME: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', IE: 'Ireland',
  NL: 'Netherlands', DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy',
  PT: 'Portugal', BE: 'Belgium', CH: 'Switzerland', AT: 'Austria',
  SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', PL: 'Poland',
  CZ: 'Czechia', GR: 'Greece', TR: 'Turkey', RU: 'Russia', UA: 'Ukraine',
  AU: 'Australia', NZ: 'New Zealand', JP: 'Japan', KR: 'South Korea',
  CN: 'China', HK: 'Hong Kong', TW: 'Taiwan', SG: 'Singapore',
  MY: 'Malaysia', TH: 'Thailand', VN: 'Vietnam', PH: 'Philippines',
  ID: 'Indonesia', IN: 'India', PK: 'Pakistan', BD: 'Bangladesh',
  AE: 'United Arab Emirates', SA: 'Saudi Arabia', IL: 'Israel',
  EG: 'Egypt', ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya',
  MX: 'Mexico', BR: 'Brazil', AR: 'Argentina', CL: 'Chile',
  CO: 'Colombia', PE: 'Peru', VE: 'Venezuela',
};

function normalizeCountry(value: string): string {
  if (!value) return '';
  if (value.length === 2) return ISO_TO_COUNTRY_NAME[value.toUpperCase()] || value.toUpperCase();
  return value;
}

// Best-effort geo resolution. Edge hosts (Vercel, Cloudflare) set these
// headers on every request for free — far more reliable than ipapi.co,
// which rate-limits anonymous lookups and returns empty for VPN / IPv6 /
// private IP ranges. We only fall back to ipapi.co when no edge header is
// present and the IP is public.
function geoFromHeaders(request: Request): { country: string; city: string; region: string } | null {
  const h = request.headers;
  const rawCountry =
    h.get('x-vercel-ip-country') ||
    h.get('cf-ipcountry') ||
    h.get('x-country-code') ||
    '';
  const country = normalizeCountry(rawCountry);
  const city =
    decodeURIComponent(h.get('x-vercel-ip-city') || '') ||
    h.get('cf-ipcity') ||
    '';
  const region =
    h.get('x-vercel-ip-country-region') ||
    h.get('cf-region') ||
    '';
  if (country || city || region) {
    return { country, city, region };
  }
  return null;
}

function isLocalIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return false;
}

// Returns the authenticated user's role (or null) without throwing. We use
// this to drop tracking events from logged-in admins so the dashboard only
// reflects real visitors, not staff page-loads.
async function roleFromCookie(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('Cookie') ?? request.headers.get('cookie') ?? '';
  const token = cookieHeader.match(/supabase-access-token=([^;]+)/)?.[1];
  if (!token) return null;
  try {
    const { data } = await supabaseAdmin.auth.getUser(token);
    return (data.user?.user_metadata?.role as string) ?? null;
  } catch {
    return null;
  }
}

// POST /api/visitors — record a page visit (public, no auth required)
export async function POST(request: Request) {
  try {
    // Rate limit by IP to prevent database spam
    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown';
    if (isVisitorRateLimited(clientIp)) {
      return NextResponse.json({ ok: false, error: 'Rate limited' }, { status: 429 });
    }

    // Drop dev traffic server-side too, in case a client without the
    // hostname guard (curl, a different deployment) hits this endpoint.
    if (isLocalIp(clientIp)) {
      return NextResponse.json({ ok: true, skipped: 'local' });
    }

    // Drop tracking events from logged-in admins — otherwise every time
    // staff opens the live site to spot-check content, it bumps the
    // visitor count and pollutes the referrer / location breakdowns.
    const role = await roleFromCookie(request);
    if (role === 'ADMIN') {
      return NextResponse.json({ ok: true, skipped: 'admin' });
    }

    const body = await request.json();
    const { pageUrl, referrer, utmSource, utmMedium, utmCampaign, sessionId } = body;

    // Parse user agent
    const userAgent = request.headers.get('user-agent') || '';
    const deviceType = /mobile/i.test(userAgent) ? 'mobile' : /tablet|ipad/i.test(userAgent) ? 'tablet' : 'desktop';
    const browser = parseBrowser(userAgent);
    const os = parseOS(userAgent);

    // Geo: edge headers first (free, accurate, instant), then fall back to
    // ipapi.co for local-dev / non-edge deployments.
    let country = '', city = '', region = '';
    const edgeGeo = geoFromHeaders(request);
    if (edgeGeo) {
      country = edgeGeo.country;
      city = edgeGeo.city;
      region = edgeGeo.region;
    } else if (clientIp && clientIp !== 'unknown') {
      try {
        const geoRes = await fetch(`https://ipapi.co/${clientIp}/json/`, { signal: AbortSignal.timeout(2000) });
        if (geoRes.ok) {
          const geo = await geoRes.json();
          country = geo.country_name || '';
          city = geo.city || '';
          region = geo.region || '';
        } else {
          logger.warn('ipapi.co lookup non-ok:', geoRes.status);
        }
      } catch (err) {
        logger.warn('ipapi.co lookup failed:', err);
      }
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
      ip_address: clientIp && clientIp !== 'unknown' ? hashIp(clientIp) : null,
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
      logger.error('Visitor tracking error:', error.message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// GET /api/visitors — admin-only: fetch visitor analytics
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

  try {
    const { searchParams } = new URL(request.url);
    const days = Math.max(1, Math.min(parseInt(searchParams.get('days') || '30', 10) || 30, 365));

    // IANA timezone from the client (e.g. "America/Chicago"). Whitelist by
    // format so a malformed value can't propagate to Postgres as-is. We still
    // pass it through as an RPC argument (parameterized), but cheap to guard.
    const rawTz = (searchParams.get('tz') || '').trim();
    const tz = /^[A-Za-z_+-]+(?:\/[A-Za-z_+-]+){0,2}$/.test(rawTz) && rawTz.length <= 64
      ? rawTz
      : 'UTC';

    // Aggregation happens entirely in Postgres — no 500-row JS undercount.
    const { data, error } = await supabaseAdmin.rpc('get_visitor_analytics', { days_back: days, tz });

    if (error) {
      logger.error('Visitor analytics RPC failed:', error);
      return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
    }

    // The SQL-side regexp pulls hostname for referrers, but fall back to a
    // JS hostname parse for any rows whose referrer regex didn't match a host
    // (e.g. app-deeplink schemes). We also guard new URL() so a single
    // malformed referrer can't 500 the whole dashboard.
    const payload = (data || {}) as Record<string, any>;
    const referrers = Array.isArray(payload.topReferrers) ? payload.topReferrers : [];
    payload.topReferrers = referrers.map((r: any) => ({
      source: r.source === r.referrer ? safeHostname(r.source) : (r.source || 'Direct'),
      count: Number(r.count) || 0,
    }));

    return NextResponse.json(payload);
  } catch (err) {
    logger.error('Visitor analytics failed:', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
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
