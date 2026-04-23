// Shared retailer catalogue — name → optional url → static favicon path.
// Originally lived only inside src/app/page.tsx; extracted so the admin UI can
// also show retailer logos (comment drawers, etc.). Keep this in sync with the
// landing-page list: if you add a retailer there, add it here.

export interface Retailer {
  name: string;
  url?: string;
}

export const RETAILERS: Retailer[] = [
  { name: 'Cub Foods', url: 'https://www.cub.com/' },
  { name: 'UNFI', url: 'https://www.unfi.com/' },
  { name: 'Festival Foods', url: 'https://www.festfoods.com/' },
  { name: "Coborn's", url: 'https://coborns.com/' },
  { name: 'Lunds & Byerlys', url: 'https://www.lundsandbyerlys.com/' },
  { name: 'Lucky Seven', url: 'https://luckysevengeneralstores.com/' },
  { name: "Von Hanson's", url: 'https://vonhansons.com/' },
  { name: 'Lipari', url: 'https://liparifoods.com/' },
  { name: 'SpartanNash', url: 'https://www.spartannash.com/' },
  { name: 'Fortune Fish', url: 'https://www.fortunefishco.net/' },
  { name: 'US Foods', url: 'https://www.usfoods.com/' },
  { name: 'Royal' },
  { name: 'Ronmar', url: 'https://www.ronmarfoods.com/' },
  { name: "Bill's Superette", url: 'https://www.billssuperette.com/' },
  { name: 'Cash Wise', url: 'https://cashwise.com/' },
  { name: 'Fresh Thyme', url: 'https://ww2.freshthyme.com/' },
  { name: 'CPW', url: 'https://www.cpw.coop/' },
  { name: "Brown's", url: 'https://brownsicecream.com/' },
  { name: 'Do It Best', url: 'https://www.doitbest.com/' },
  { name: "Hugo's", url: 'https://www.gohugos.com/' },
  { name: 'Piggly Wiggly', url: 'https://www.shopthepig.com/' },
  { name: "Woodman's", url: 'https://www.woodmans-food.com/' },
  { name: "Kowalski's", url: 'https://www.kowalskis.com/' },
  { name: "Knowlan's", url: 'https://www.knowlansfreshfoods.com/' },
  { name: 'Leevers Foods', url: 'https://www.leeversfoods.com/' },
  { name: "Hornbacher's", url: 'https://hornbachers.com/' },
  { name: "Jerry's", url: 'https://www.jerrysfoods.com/' },
  { name: "Nilssen's", url: 'https://www.nilssensfoods.com/' },
  { name: "Dick's Fresh Market", url: 'https://www.dicksfreshmarket.com/' },
  { name: "Lueken's", url: 'https://www.luekens.com/' },
  { name: 'Lakewinds', url: 'https://www.lakewinds.coop/' },
  { name: "Mackenthun's", url: 'https://mackenthuns.com/' },
  { name: 'Hy-Vee', url: 'https://www.hy-vee.com/' },
  { name: 'Seward Co-op', url: 'https://seward.coop/' },
  { name: 'Wedge', url: 'https://wedge.coop/' },
];

const HOST_TO_FAVICON: Record<string, string> = {
  'www.cub.com': '/favicons/cub-com.png',
  'www.unfi.com': '/favicons/unfi-com.png',
  'www.festfoods.com': '/favicons/festfoods-com.png',
  'coborns.com': '/favicons/coborns-com.png',
  'www.lundsandbyerlys.com': '/favicons/lundsandbyerlys-com.png',
  'luckysevengeneralstores.com': '/favicons/luckysevengeneralstores-com.png',
  'vonhansons.com': '/favicons/vonhansons-com.png',
  'liparifoods.com': '/favicons/liparifoods-com.png',
  'www.spartannash.com': '/favicons/spartannash-com.png',
  'www.usfoods.com': '/favicons/usfoods-com.png',
  'www.ronmarfoods.com': '/favicons/ronmarfoods-com.png',
  'www.billssuperette.com': '/favicons/billssuperette-com.png',
  'cashwise.com': '/favicons/cashwise-com.png',
  'ww2.freshthyme.com': '/favicons/ww2-freshthyme-com.png',
  'www.cpw.coop': '/favicons/cpw-coop.png',
  'brownsicecream.com': '/favicons/brownsicecream-com.png',
  'www.doitbest.com': '/favicons/doitbest-com.png',
  'www.gohugos.com': '/favicons/gohugos-com.png',
  'www.shopthepig.com': '/favicons/shopthepig-com.png',
  'www.woodmans-food.com': '/favicons/woodmans-food-com.png',
  'www.kowalskis.com': '/favicons/kowalskis-com.png',
  'www.leeversfoods.com': '/favicons/leeversfoods-com.png',
  'hornbachers.com': '/favicons/hornbachers-com.png',
  'www.jerrysfoods.com': '/favicons/jerrysfoods-com.png',
  'www.nilssensfoods.com': '/favicons/nilssensfoods-com.png',
  'www.dicksfreshmarket.com': '/favicons/dicksfreshmarket-com.png',
  'www.luekens.com': '/favicons/luekens-com.png',
  'www.lakewinds.coop': '/favicons/lakewinds-coop.png',
  'mackenthuns.com': '/favicons/mackenthuns-com.png',
  'www.hy-vee.com': '/favicons/hy-vee-com.png',
  'seward.coop': '/favicons/seward-coop.png',
  'wedge.coop': '/favicons/wedge-coop.png',
};

export function retailerFaviconForUrl(url?: string): string | null {
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

// Drop apostrophes entirely so "KOWALSKIS" matches "Kowalski's",
// "COBORNS" matches "Coborn's", "BROWNS" matches "Brown's", etc. Scorecards
// rarely include the punctuation the retailer's marketing name does.
const loose = (s: string) => normalize(s).replace(/[']/g, '');

// Look up a retailer by its display name — handles "HY-VEE" ↔ "Hy-Vee",
// "LUNDS&BYERLYS" ↔ "Lunds & Byerlys", "KOWALSKIS" ↔ "Kowalski's", etc.
export function findRetailerByName(name: string | null | undefined): Retailer | null {
  if (!name) return null;
  const target = normalize(name);
  const targetLoose = loose(name);
  if (!target) return null;
  const exact = RETAILERS.find(r => normalize(r.name) === target);
  if (exact) return exact;
  const alias = RETAILERS.find(r => loose(r.name) === targetLoose);
  if (alias) return alias;
  const partial = RETAILERS.find(r => {
    const n = loose(r.name);
    return n && (n.includes(targetLoose) || targetLoose.includes(n));
  });
  return partial ?? null;
}

export function findRetailerFavicon(name: string | null | undefined): string | null {
  const r = findRetailerByName(name);
  return r ? retailerFaviconForUrl(r.url) : null;
}

export function findRetailerUrl(name: string | null | undefined): string | null {
  const r = findRetailerByName(name);
  return r?.url ?? null;
}
