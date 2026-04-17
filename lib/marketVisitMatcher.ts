// Store-name matcher used by the market-visit → scorecard auto-comment flow.
//
// Previous implementation used `String.includes()` which produced surprising
// cross-chain matches — e.g. a visit typed as "Kowalski's Woodbury" attached
// to the Lunds&Byerlys chain because both subgrids happened to contain a
// "Woodbury" store. Swap that for a word-boundary matcher: the shorter string
// must appear as a contiguous sequence of whole words inside the longer one,
// OR be exactly equal after normalization.

export function normalizeStoreName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s*&\s*/g, '&')
    .replace(/[\u2018\u2019\u2032`]/g, "'")
    .replace(/\s+/g, ' ');
}

// A looser variant used only for whole-word comparison. Strips apostrophes so
// "Kowalski's" matches chain name "Kowalskis", and normalizes the ampersand
// form we preserved in the base normalize.
function tokenize(s: string): string[] {
  return normalizeStoreName(s)
    .replace(/'/g, '')
    .split(' ')
    .filter(Boolean);
}

function containsContiguous(longer: string[], shorter: string[]): boolean {
  if (shorter.length === 0 || shorter.length > longer.length) return false;
  for (let i = 0; i <= longer.length - shorter.length; i++) {
    let ok = true;
    for (let j = 0; j < shorter.length; j++) {
      if (longer[i + j] !== shorter[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

// Higher score = better match. 0 = no match.
// 100: exact normalized equality
//  50+len: candidate tokens are a contiguous subsequence of typed tokens
//  40+len: typed tokens are a contiguous subsequence of candidate tokens
// Longer overlaps outscore shorter ones, so "L&B Woodbury" beats "Woodbury"
// when the typed name contains both.
export function matchScore(candidate: string, typed: string): number {
  if (!candidate || !typed) return 0;
  const nc = normalizeStoreName(candidate);
  const nt = normalizeStoreName(typed);
  if (!nc || !nt) return 0;
  if (nc === nt) return 100;

  const ct = tokenize(candidate);
  const tt = tokenize(typed);
  if (ct.length === 0 || tt.length === 0) return 0;

  // Reject single-token candidate-in-typed matches: a subrow named just
  // "Woodbury" would otherwise attach a visit typed "Kowalski's Woodbury"
  // to the wrong chain's subgrid on the strength of one shared city token.
  if (ct.length >= 2 && containsContiguous(tt, ct)) return 50 + ct.length;
  if (containsContiguous(ct, tt)) return 40 + tt.length;
  return 0;
}

export type MatchResult<T> = { item: T; score: number } | null;

// Pick the best-scoring item from a list. Ties broken by first occurrence.
export function bestMatch<T>(
  items: T[],
  getName: (item: T) => string | null | undefined,
  typed: string,
): MatchResult<T> {
  let best: MatchResult<T> = null;
  for (const item of items) {
    const name = getName(item);
    if (!name) continue;
    const score = matchScore(name, typed);
    if (score > 0 && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best;
}
