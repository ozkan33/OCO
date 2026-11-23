import { supabaseAdmin } from './supabaseAdmin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

// Resolve the scorecard a brand user's assignment should point at.
//
// The id can be stale (a browser-local "scorecard_…" id, a deleted scorecard,
// or an empty duplicate). The only safe fallback is the scorecard whose TITLE
// is the user's own brand — never "any scorecard that shares a product column
// key", because different brands share keys like hot_sauce and that hands one
// brand another brand's data. No confident match → null, and the caller must
// leave the user unassigned rather than guess.
export async function resolveBrandScorecardId(
  scorecardId: string,
  brandName: string | null | undefined,
): Promise<string | null> {
  let direct: { id: string; title: string | null; data: any } | null = null;
  if (UUID_RE.test(scorecardId)) {
    const { data } = await supabaseAdmin
      .from('user_scorecards')
      .select('id, title, data')
      .eq('id', scorecardId)
      .maybeSingle();
    direct = data ?? null;
  }
  if (direct?.data?.rows?.length) return direct.id;

  const wanted = new Set([norm(brandName), norm(direct?.title)].filter(Boolean));
  if (wanted.size > 0) {
    const { data: titles } = await supabaseAdmin.from('user_scorecards').select('id, title');
    const candidateIds = (titles || [])
      .filter((t: { id: string; title: string | null }) => wanted.has(norm(t.title)) && t.id !== direct?.id)
      .map((t: { id: string }) => t.id);
    if (candidateIds.length > 0) {
      const { data: candidates } = await supabaseAdmin
        .from('user_scorecards')
        .select('id, data')
        .in('id', candidateIds);
      const populated = (candidates || []).filter((c: { id: string; data: any }) => c.data?.rows?.length);
      // Two populated scorecards with the same title is ambiguous — don't pick.
      if (populated.length === 1) return populated[0].id;
    }
  }

  return direct?.id ?? null;
}
