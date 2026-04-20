/**
 * Chain-name fuzzy matcher for the admin scorecard "Chain Name" column.
 *
 * Design goals:
 *  - Prefix matches beat edit-distance matches (user typing "Cub Foods" should
 *    find "CUB FOODS HAUG GROUP", never "SUN FOODS").
 *  - Token-aware scoring; the FIRST token carries the most signal. Generic
 *    suffix tokens ("FOODS", "MARKET", "STORES", ...) are discounted so they
 *    can't alone promote a bad match.
 *  - Weak fuzzy hits (only a generic suffix in common, or the first token is
 *    nowhere near) are rejected -> `unknown`, not a bad suggestion.
 *  - Synchronous, dependency-free, runs on server & client.
 *
 * `ChainMatch` kinds: exact | normalized | prefix | fuzzy | unknown | empty.
 */

export type ChainMatch =
  | { kind: 'empty' }
  | { kind: 'exact'; canonical: string }
  | { kind: 'normalized'; canonical: string }
  | { kind: 'prefix'; suggestion: string; alternatives: string[] }
  | { kind: 'fuzzy'; suggestion: string; score: number }
  | { kind: 'unknown' };

/**
 * Case/punctuation-insensitive key for "is this the same name?" comparisons.
 * Keeps alphanumerics only, collapses whitespace, lowercases.
 *   "Hy-Vee" -> "hyvee", "CUB FOODS" -> "cubfoods".
 */
export function strictKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

// Back-compat shim: older callers imported `normalizeChain`. Same semantics
// as strictKey (alphanumeric-only lowercase key), kept exported so any stale
// import still works until those are migrated.
export function normalizeChain(s: string): string {
  return strictKey(s || '');
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Generic tokens that can't alone carry a match signal — e.g. two names sharing
 * "FOODS" is not evidence of a typo. If the ONLY overlap is generic, reject.
 */
const GENERIC_TOKENS = new Set([
  'foods', 'food', 'market', 'markets', 'store', 'stores',
  'grocery', 'groceries', 'supermarket', 'supermarkets',
  'co', 'company', 'inc', 'llc', 'the', 'of', 'and', 'group',
]);

/**
 * Damerau-Levenshtein distance (adjacent-transposition is 1 edit, so "teh"/"the"
 * and "targt"/"target" are distance 1 — matches human typo intuition).
 */
function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const prevPrev: number[] = new Array(bl + 1);
  const prev: number[] = new Array(bl + 1);
  const curr: number[] = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, prevPrev[j - 2] + 1);
      }
      curr[j] = v;
    }
    for (let j = 0; j <= bl; j++) {
      prevPrev[j] = prev[j];
      prev[j] = curr[j];
    }
  }
  return prev[bl];
}

function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const d = damerauLevenshtein(a, b);
  const max = Math.max(a.length, b.length);
  return 1 - d / max;
}

/**
 * Composite score in [0, 1]:
 *   0.45 * first-token sim     (the distinctive part)
 *   0.25 * non-generic Jaccard (product-identity overlap)
 *   0.05 * all-token Jaccard   (sanity)
 *   0.25 * whole-string sim    (catches single-token typos)
 *
 * "CUB FOODS" vs "SUN FOODS" -> ~0.36 (below threshold). Good.
 * "COBORM" vs "COBORNS"     -> ~0.50, but single-token-typo rule accepts it.
 */
function tokenScore(
  input: string,
  cand: string,
  inputTokens: string[],
  candTokens: string[],
): { score: number; firstTokenSim: number; wholeSim: number } {
  if (inputTokens.length === 0 || candTokens.length === 0) {
    return { score: 0, firstTokenSim: 0, wholeSim: 0 };
  }

  const firstSim = similarity(inputTokens[0], candTokens[0]);
  const wholeSim = similarity(strictKey(input), strictKey(cand));

  const inSet = new Set(inputTokens);
  const cSet = new Set(candTokens);
  const allUnion = new Set([...inSet, ...cSet]);
  let allInter = 0;
  for (const t of inSet) if (cSet.has(t)) allInter++;
  const allJaccard = allUnion.size === 0 ? 0 : allInter / allUnion.size;

  const inNonGen = new Set([...inSet].filter((t) => !GENERIC_TOKENS.has(t)));
  const cNonGen = new Set([...cSet].filter((t) => !GENERIC_TOKENS.has(t)));
  let nonGenInter = 0;
  for (const t of inNonGen) if (cNonGen.has(t)) nonGenInter++;
  const nonGenUnion = new Set([...inNonGen, ...cNonGen]);
  const nonGenJaccard = nonGenUnion.size === 0 ? 0 : nonGenInter / nonGenUnion.size;

  const score =
    0.45 * firstSim +
    0.25 * nonGenJaccard +
    0.05 * allJaccard +
    0.25 * wholeSim;
  return { score, firstTokenSim: firstSim, wholeSim };
}

const FUZZY_THRESHOLD = 0.55;
const FIRST_TOKEN_MIN_SIM = 0.4;

export function matchChain(value: string, knownChains: readonly string[]): ChainMatch {
  const raw = (value ?? '').trim();
  if (!raw) return { kind: 'empty' };
  if (!knownChains || knownChains.length === 0) return { kind: 'unknown' };

  for (const c of knownChains) {
    if (c === raw) return { kind: 'exact', canonical: c };
  }

  const rawKey = strictKey(raw);
  if (rawKey.length > 0) {
    for (const c of knownChains) {
      if (strictKey(c) === rawKey) return { kind: 'normalized', canonical: c };
    }
  }

  const inputTokens = tokenize(raw);
  if (inputTokens.length === 0) return { kind: 'unknown' };

  // Reject obvious "only generic tokens were typed" inputs: "Foods", "Market".
  const inputHasNonGeneric = inputTokens.some((t) => !GENERIC_TOKENS.has(t));
  if (!inputHasNonGeneric) return { kind: 'unknown' };

  // Prefix match (token-aware): does the input's token stream prefix any
  // canonical's? Example: "Cub Foods" -> "CUB FOODS HAUG GROUP".
  const prefixHits: string[] = [];
  for (const c of knownChains) {
    const cTokens = tokenize(c);
    if (cTokens.length <= inputTokens.length) continue;
    let ok = true;
    for (let i = 0; i < inputTokens.length; i++) {
      if (cTokens[i] !== inputTokens[i]) { ok = false; break; }
    }
    if (ok) prefixHits.push(c);
  }
  // "Last token is a prefix" fallback: "Cub Food" -> "CUB FOODS ...".
  if (prefixHits.length === 0 && inputTokens.length >= 1) {
    const head = inputTokens.slice(0, -1);
    const last = inputTokens[inputTokens.length - 1];
    for (const c of knownChains) {
      const cTokens = tokenize(c);
      if (cTokens.length <= head.length) continue;
      let ok = true;
      for (let i = 0; i < head.length; i++) {
        if (cTokens[i] !== head[i]) { ok = false; break; }
      }
      if (ok && cTokens[head.length].startsWith(last) && cTokens[head.length] !== last) {
        prefixHits.push(c);
      }
    }
  }
  if (prefixHits.length > 0) {
    // If multiple canonicals prefix-match, picking one as the "right" answer
    // is almost always wrong (chain_stores may be populated with franchise-
    // operator entries like "CUB FOODS JERRY'S" and the user is typing the
    // parent brand "Cub Foods"). Instead, derive the COMMON token prefix of
    // all hits — that's the implied parent brand — and suggest it.
    if (prefixHits.length >= 2) {
      const hitTokenLists = prefixHits.map(tokenize);
      const minLen = Math.min(...hitTokenLists.map(t => t.length));
      let commonLen = 0;
      while (commonLen < minLen) {
        const tok = hitTokenLists[0][commonLen];
        if (hitTokenLists.every(tl => tl[commonLen] === tok)) commonLen++;
        else break;
      }
      const commonTokens = hitTokenLists[0].slice(0, commonLen);
      const hasNonGeneric = commonTokens.some(t => !GENERIC_TOKENS.has(t));
      // Require at least 2 shared tokens with at least one being non-generic.
      // Single-word commonalities like "CUBA" between "CUBA CASH STORE" and
      // "CUBA CHEESE SHOPPE" are coincidences, not a brand.
      if (commonLen >= 2 && hasNonGeneric) {
        const canonicalBrand = commonTokens.map(t => t.toUpperCase()).join(' ');
        const brandKey = commonTokens.join('');
        // Input already equals the derived brand -> silent accept.
        if (rawKey === brandKey) {
          return { kind: 'normalized', canonical: raw };
        }
        return {
          kind: 'prefix',
          suggestion: canonicalBrand,
          alternatives: [],
        };
      }
      return { kind: 'unknown' };
    }
    const sorted = [...prefixHits].sort((a, b) => a.length - b.length);
    return {
      kind: 'prefix',
      suggestion: sorted[0],
      alternatives: sorted.slice(1),
    };
  }

  let best: {
    chain: string;
    score: number;
    firstTokenSim: number;
    wholeSim: number;
  } | null = null;
  for (const c of knownChains) {
    const cTokens = tokenize(c);
    const { score, firstTokenSim, wholeSim } = tokenScore(raw, c, inputTokens, cTokens);
    if (!best || score > best.score) best = { chain: c, score, firstTokenSim, wholeSim };
  }

  if (best) {
    const strong = best.score >= FUZZY_THRESHOLD && best.firstTokenSim >= FIRST_TOKEN_MIN_SIM;
    // Single-token typo catcher: "COBORM" -> "COBORNS", "TARGT" -> "TARGET".
    const singleTokenTypo =
      inputTokens.length === 1 &&
      best.wholeSim >= 0.7 &&
      best.firstTokenSim >= 0.7;
    if (strong || singleTokenTypo) {
      // Brand-prefix preference: when the user types a typo'd brand name
      // ("Cub Foodsz") and the best fuzzy match is a specific franchise
      // ("CUB FOODS JERRY'S"), prefer suggesting the shared brand prefix
      // ("CUB FOODS") if multiple canonicals share it. Mirrors the prefix-
      // path brand derivation (lines ~215-241) so typos get the same
      // brand-aware treatment exact prefixes do.
      const bestTokens = tokenize(best.chain);
      const brandLen = inputTokens.length;
      if (bestTokens.length > brandLen) {
        const candidatePrefix = bestTokens.slice(0, brandLen);
        const hasNonGeneric = candidatePrefix.some((t) => !GENERIC_TOKENS.has(t));
        if (hasNonGeneric) {
          let siblings = 0;
          for (const c of knownChains) {
            const ct = tokenize(c);
            if (ct.length < brandLen) continue;
            let ok = true;
            for (let i = 0; i < brandLen; i++) {
              if (ct[i] !== candidatePrefix[i]) { ok = false; break; }
            }
            if (ok) {
              siblings++;
              if (siblings >= 2) break;
            }
          }
          if (siblings >= 2) {
            const brandSuggestion = candidatePrefix.map((t) => t.toUpperCase()).join(' ');
            // Only suggest the brand if the input is genuinely close to it
            // (not a different brand that happens to share a first token).
            // "Cub Foodsz" vs "Cub Foods" -> 0.88; "Cub Bargain" vs "Cub Foods" -> 0.45.
            const brandSim = similarity(rawKey, strictKey(brandSuggestion));
            if (brandSim >= 0.7) {
              return { kind: 'fuzzy', suggestion: brandSuggestion, score: best.score };
            }
          }
        }
      }
      return { kind: 'fuzzy', suggestion: best.chain, score: best.score };
    }
  }

  return { kind: 'unknown' };
}

/**
 * Given a value the admin is trying to set on a scorecard row, and the set of
 * strictKey'd names already used on other rows, find the next alphabetically-
 * available canonical from knownChains that shares the same brand prefix as
 * the input. Returns null if no coherent alternative exists.
 *
 * Example: input "Cub Foods", used = {"cubfoods"} (another row already has it),
 * knownChains includes CUB FOODS CORP STORES / HAUG GROUP / JERRY'S / ...
 *   -> returns "CUB FOODS CORP STORES" (first alphabetically among unused).
 */
export function suggestAlternative(
  input: string,
  knownChains: readonly string[],
  usedKeys: ReadonlySet<string>,
): string | null {
  const inputTokens = tokenize(input);
  if (inputTokens.length === 0) return null;

  // Derive the brand-prefix tokens:
  //   1. If any canonical's tokens start with inputTokens exactly -> use inputTokens.
  //   2. Else if inputTokens' last token is a prefix of canonicals' next token
  //      (e.g., "Cub Food" -> "CUB FOODS ..."), extend it to the canonical form.
  //   3. Else fall back to inputTokens as the brand prefix.
  let brandTokens: string[] = inputTokens.slice();

  const fullPrefixHits = knownChains.filter(c => {
    const ct = tokenize(c);
    if (ct.length < inputTokens.length) return false;
    for (let i = 0; i < inputTokens.length; i++) {
      if (ct[i] !== inputTokens[i]) return false;
    }
    return true;
  });

  if (fullPrefixHits.length === 0 && inputTokens.length >= 1) {
    const head = inputTokens.slice(0, -1);
    const last = inputTokens[inputTokens.length - 1];
    const extendHit = knownChains.find(c => {
      const ct = tokenize(c);
      if (ct.length <= head.length) return false;
      for (let i = 0; i < head.length; i++) {
        if (ct[i] !== head[i]) return false;
      }
      return ct[head.length].startsWith(last) && ct[head.length] !== last;
    });
    if (extendHit) {
      const extTokens = tokenize(extendHit);
      brandTokens = extTokens.slice(0, head.length + 1);
    }
  }

  // Collect all canonicals matching the brand-prefix tokens.
  const candidates = knownChains.filter(c => {
    const ct = tokenize(c);
    if (ct.length < brandTokens.length) return false;
    for (let i = 0; i < brandTokens.length; i++) {
      if (ct[i] !== brandTokens[i]) return false;
    }
    return true;
  });

  // Drop the already-used ones and pick the first alphabetically.
  const available = candidates
    .filter(c => !usedKeys.has(strictKey(c)))
    .sort((a, b) => a.localeCompare(b));

  return available[0] ?? null;
}
