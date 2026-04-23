// Best-effort website discovery for brand/retailer logos. Used when the admin
// uploads a logo without supplying a website URL, and by the batch "auto-fill
// missing websites" action on the logos admin page.
//
// Strategy:
//   1. Retailers: look up the curated RETAILERS catalogue first — the human-
//      picked URL is always better than a guess.
//   2. Heuristics: try a handful of obvious domain patterns derived from the
//      label (e.g. "Nature Blessed" → natureblessed.com). A single fast
//      in-parallel probe per candidate; we take the highest-preference hit.
//
// Deliberately self-contained — no API keys, no third-party search. Brands
// whose domain isn't obvious from their name just stay blank; the admin can
// still type one in manually.
import { findRetailerUrl } from './retailerLogos';

type LogoKind = 'brand' | 'retailer';

const PROBE_TIMEOUT_MS = 4000;

function slugCompact(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‘’′'`]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function slugDashed(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‘’′'`]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function probe(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    // Some sites reject HEAD — use a tiny ranged GET so we still get redirects
    // but don't pay to download the full page.
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OCO-LogoResolver/1.0)',
        Accept: 'text/html,application/xhtml+xml',
        Range: 'bytes=0-0',
      },
    });
    clearTimeout(timer);
    if (res.status >= 200 && res.status < 400) {
      try {
        return new URL(res.url || url).toString();
      } catch {
        return url;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function candidateUrls(label: string): string[] {
  const compact = slugCompact(label);
  const dashed = slugDashed(label);
  if (!compact) return [];
  const list = [
    `https://${compact}.com`,
    `https://www.${compact}.com`,
    `https://${dashed}.com`,
    `https://www.${dashed}.com`,
    `https://${compact}s.com`,
    `https://get${compact}.com`,
  ];
  return Array.from(new Set(list));
}

export async function resolveLogoWebsite(
  label: string,
  kind: LogoKind = 'brand',
): Promise<string | null> {
  if (!label || !label.trim()) return null;

  if (kind === 'retailer') {
    const curated = findRetailerUrl(label);
    if (curated) return curated;
  }

  const candidates = candidateUrls(label);
  if (candidates.length === 0) return null;

  // Probe in parallel, but return the highest-preference hit (earliest in the
  // list). Promise.all keeps positional ordering so we just scan for the first
  // non-null result.
  const results = await Promise.all(candidates.map(probe));
  const firstHit = results.find(r => r !== null);
  return firstHit ?? null;
}
