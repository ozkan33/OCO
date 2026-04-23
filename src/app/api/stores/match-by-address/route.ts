import { NextResponse } from 'next/server';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import {
  loadAllChainStores,
  buildAddress,
  type ChainStoreRow,
} from '../../../../../lib/chainStoresCache';

// US state full-name <-> code map. Nominatim returns full names ("Minnesota")
// while chain_stores rows are commonly stored as the postal code ("MN") or
// vice-versa, so we normalize both sides to a canonical 2-letter code before
// comparing.
const STATE_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

function normalizeState(s: string | null | undefined): string {
  if (!s) return '';
  const t = s.trim().toLowerCase();
  if (!t) return '';
  if (t.length === 2) return t.toUpperCase();
  return STATE_TO_CODE[t] || t.toUpperCase();
}

function normalizeCity(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bst\.\b/g, 'st')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function tokenize(s: string | null | undefined): string[] {
  if (!s) return [];
  // Common road-suffix synonyms — fold to canonical short form so "Street"
  // and "St" tokens count as the same hit.
  const SYN: Record<string, string> = {
    street: 'st', avenue: 'ave', road: 'rd', boulevard: 'blvd',
    lane: 'ln', drive: 'dr', court: 'ct', place: 'pl',
    parkway: 'pkwy', circle: 'cir', highway: 'hwy', terrace: 'ter',
    north: 'n', south: 's', east: 'e', west: 'w',
    northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  };
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => SYN[t] || t);
}

interface MatchInput {
  road: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  house_number: string | null;
}

interface ScoredCandidate {
  row: ChainStoreRow;
  score: number;
}

const MATCH_THRESHOLD = 0.6;

function scoreCandidate(input: MatchInput, row: ChainStoreRow): number {
  // Hard gate: same state. Without state alignment, "West Street" matches
  // are coincidence.
  const inState = normalizeState(input.state);
  const rowState = normalizeState(row.state);
  if (inState && rowState && inState !== rowState) return 0;

  // Hard gate: same city (normalized — handles "Saint Paul" vs "St. Paul").
  // If chain_stores has no city, fall back to letting road/zip carry the match.
  const inCity = normalizeCity(input.city);
  const rowCity = normalizeCity(row.city);
  if (inCity && rowCity && inCity !== rowCity) return 0;

  // Road-token overlap: of the input road tokens, how many appear in the
  // candidate's address? Uses the input as the denominator so candidates with
  // padded names (e.g. "West Street SE") don't get diluted.
  const inRoad = tokenize(input.road);
  const rowRoad = tokenize(row.address);
  let roadScore = 0;
  if (inRoad.length > 0 && rowRoad.length > 0) {
    const rowSet = new Set(rowRoad);
    let inter = 0;
    for (const t of inRoad) if (rowSet.has(t)) inter++;
    roadScore = inter / inRoad.length;
  }

  // Street-number proximity. Strong signal for disambiguating two stores on
  // the same street — but tolerant by ~30 numbers since GPS commonly drifts
  // to the next house.
  let numScore = 0;
  const inNum = parseInt((input.house_number || '').match(/\d+/)?.[0] || '', 10);
  const rowNumStr = (row.address || '').match(/\d+/)?.[0] || '';
  const rowNum = parseInt(rowNumStr, 10);
  if (Number.isFinite(inNum) && Number.isFinite(rowNum)) {
    const dist = Math.abs(inNum - rowNum);
    if (dist === 0) numScore = 1;
    else if (dist <= 30) numScore = 0.85;
    else if (dist <= 100) numScore = 0.55;
    else if (dist <= 500) numScore = 0.25;
    else numScore = 0;
  } else {
    numScore = 0.4; // neutral when one side has no number
  }

  // Postcode exact match — extra confidence when present on both sides.
  let zipScore = 0;
  const inZip = (input.postcode || '').replace(/\D/g, '').slice(0, 5);
  const rowZip = (row.zipcode || '').replace(/\D/g, '').slice(0, 5);
  if (inZip && rowZip) {
    zipScore = inZip === rowZip ? 1 : 0;
  } else {
    zipScore = 0.3; // neutral when one side has no zip
  }

  return 0.55 * roadScore + 0.25 * numScore + 0.20 * zipScore;
}

// POST /api/stores/match-by-address
// body: { road, city, state, postcode, house_number }
// Best-effort proximity match against chain_stores using structured address
// fields from Nominatim. Returns the canonical store record (store_name +
// assembled address) when score crosses threshold, else { store: null }.
export async function POST(request: Request) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.user_metadata?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Partial<MatchInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const input: MatchInput = {
    road: body?.road || null,
    city: body?.city || null,
    state: body?.state || null,
    postcode: body?.postcode || null,
    house_number: body?.house_number || null,
  };

  // No usable signal — refuse early rather than scan the whole table.
  if (!input.road && !input.city && !input.postcode) {
    return NextResponse.json({ store: null, score: 0 });
  }

  let stores: ChainStoreRow[];
  try {
    stores = await loadAllChainStores();
  } catch {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  let best: ScoredCandidate | null = null;
  for (const row of stores) {
    const score = scoreCandidate(input, row);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { row, score };
  }

  if (!best) {
    return NextResponse.json({ store: null, score: 0 });
  }
  if (best.score < MATCH_THRESHOLD) {
    return NextResponse.json({ store: null, score: best.score });
  }

  return NextResponse.json({
    score: best.score,
    store: {
      chain_name: best.row.chain_name,
      store_name: best.row.store_name,
      address: buildAddress(best.row),
      rawAddress: best.row.address,
      city: best.row.city,
      state: best.row.state,
      zipcode: best.row.zipcode,
    },
  });
}
