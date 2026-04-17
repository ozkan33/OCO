// Shared brand catalogue — name → website URL → bundled favicon path.
// Brand favicons live in /public/logos/ and were pulled from each brand's
// website (same approach as /public/favicons/ for retailer favicons). This
// lets the admin UI show a brand logo next to a scorecard name without
// requiring the admin to upload a logo via /admin/client-logos first.

export interface Brand {
  name: string;
  url?: string;
}

// One entry per canonical brand. Aliases (e.g. "Dino's" / "Dinos") are handled
// by the normalize-then-match logic in findBrandLogo, so we don't duplicate.
export const BRANDS: Brand[] = [
  { name: 'Big Watt', url: 'https://bigwattbeverage.com' },
  { name: 'Buon Giorno', url: 'https://buongiornousa.com' },
  { name: "Cry Baby Craig's", url: 'https://crybabycraigs.com' },
  { name: "Davanni's", url: 'https://www.davannis.com' },
  { name: "Dino's", url: 'https://dinosfreshkitchen.com' },
  { name: "JoMomma's", url: 'https://www.jomommas.com' },
  { name: 'Ken Davis', url: 'https://kendavisbbq.com' },
  { name: 'La Perla', url: 'https://www.tortillalaperla.com' },
  { name: 'Nature Blessed', url: 'https://colomafrozen.com' },
  { name: 'Northstar Kombucha', url: 'https://www.northstarkombucha.com' },
  { name: 'Seven Bridges', url: 'https://sevenbridgessauces.com' },
  { name: 'Skinny Sticks', url: 'https://www.skinnysticksmaplesyrup.com' },
  { name: 'Smude', url: 'https://www.smudeoil.com' },
  { name: 'Sturdiwheat', url: 'https://www.sturdiwheat.com' },
  { name: 'Superior Water', url: 'https://www.superiormineralwater.com' },
  { name: "Sweet Martha's", url: 'https://www.sweetmarthas.com' },
  { name: 'Taco Terco', url: 'https://tacoterco.com' },
  { name: 'Coloma Frozen Foods', url: 'https://colomafrozen.com' },
];

// Host → bundled favicon path. Hosts here should match the URLs above after
// parsing with new URL(...).hostname.
const HOST_TO_FAVICON: Record<string, string> = {
  'bigwattbeverage.com': '/logos/bigwattbeverage-com.png',
  'buongiornousa.com': '/logos/buongiornousa-com.png',
  'crybabycraigs.com': '/logos/crybabycraigs-com.png',
  'www.davannis.com': '/logos/davannis-com.png',
  'dinosfreshkitchen.com': '/logos/dinosfreshkitchen-com.png',
  'www.jomommas.com': '/logos/jomommas-com.png',
  'kendavisbbq.com': '/logos/kendavisbbq-com.png',
  'www.tortillalaperla.com': '/logos/tortillalaperla-com.png',
  'colomafrozen.com': '/logos/colomafrozen-com.png',
  'www.northstarkombucha.com': '/logos/northstarkombucha-com.png',
  'sevenbridgessauces.com': '/logos/sevenbridgessauces-com.png',
  'www.skinnysticksmaplesyrup.com': '/logos/skinnysticksmaplesyrup-com.png',
  'www.smudeoil.com': '/logos/smudeoil-com.png',
  'www.sturdiwheat.com': '/logos/sturdiwheat-com.png',
  'www.superiormineralwater.com': '/logos/superiormineralwater-com.png',
  'www.sweetmarthas.com': '/logos/sweetmarthas-com.png',
  'tacoterco.com': '/logos/tacoterco-com.png',
};

function brandFaviconForUrl(url?: string): string | null {
  if (!url) return null;
  try {
    return HOST_TO_FAVICON[new URL(url).hostname] || null;
  } catch { return null; }
}

const normalize = (s: string) =>
  s.trim().toLowerCase()
    .replace(/[\u2018\u2019\u2032`]/g, "'")
    .replace(/\s*&\s*/g, '&')
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9&' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Drop punctuation/apostrophes entirely for fuzzy alias matching (e.g.
// "Cry Baby Craigs" ↔ "Cry Baby Craig's", "JoMommas" ↔ "JoMomma's").
const loose = (s: string) => normalize(s).replace(/[']/g, '');

export function findBrandLogo(name: string | null | undefined): string | null {
  if (!name) return null;
  const target = normalize(name);
  const targetLoose = loose(name);
  if (!target) return null;

  // Exact match (normalized)
  const exact = BRANDS.find(b => normalize(b.name) === target);
  if (exact) return brandFaviconForUrl(exact.url);

  // Alias match ignoring apostrophes
  const alias = BRANDS.find(b => loose(b.name) === targetLoose);
  if (alias) return brandFaviconForUrl(alias.url);

  // Substring match, either direction
  const partial = BRANDS.find(b => {
    const n = normalize(b.name);
    return n && (n.includes(target) || target.includes(n));
  });
  return partial ? brandFaviconForUrl(partial.url) : null;
}
