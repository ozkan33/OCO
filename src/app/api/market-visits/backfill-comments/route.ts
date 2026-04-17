import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';
import { bestMatch } from '../../../../../lib/marketVisitMatcher';

// POST /api/market-visits/backfill-comments
// Back-populates subgrid and parent-row comments from market_visits that
// existed before the matching scorecard rows were created. Idempotent —
// skips any comment whose exact text is already present for the target row.
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const body = await request.json().catch(() => ({}));
    const scorecardId: string | undefined = body?.scorecard_id;

    if (!scorecardId || typeof scorecardId !== 'string' || scorecardId.startsWith('scorecard_')) {
      return NextResponse.json({ error: 'Invalid scorecard_id' }, { status: 400 });
    }

    const { data: scorecard, error: scErr } = await supabaseAdmin
      .from('user_scorecards')
      .select('id, title, data')
      .eq('id', scorecardId)
      .eq('user_id', user.id)
      .single();

    if (scErr || !scorecard) {
      return NextResponse.json({ error: 'Scorecard not found or access denied' }, { status: 404 });
    }

    const rows: any[] = scorecard.data?.rows || [];
    if (rows.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    const { data: visits, error: visitsErr } = await supabaseAdmin
      .from('market_visits')
      .select('id, user_id, store_name, note, visit_date, brands')
      .contains('brands', [scorecard.title])
      .not('store_name', 'is', null)
      .not('note', 'is', null);

    if (visitsErr) {
      logger.error('Backfill visits query failed:', visitsErr);
      return NextResponse.json({ error: 'Failed to load visits' }, { status: 500 });
    }

    if (!visits || visits.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    const { data: existingComments } = await supabaseAdmin
      .from('comments')
      .select('text, row_id, parent_row_id')
      .eq('scorecard_id', scorecardId);

    const existingKeys = new Set(
      (existingComments || []).map(
        (c: { text: string; row_id: string; parent_row_id: string | null }) =>
          `${c.parent_row_id ?? ''}|${c.row_id}|${c.text}`,
      ),
    );

    const inserts: Array<{
      scorecard_id: string;
      user_id: string;
      user_email: string;
      row_id: string;
      parent_row_id?: string;
      text: string;
      created_at: string;
      updated_at: string;
    }> = [];

    for (const visit of visits) {
      const storeName = String(visit.store_name || '').trim();
      const note = String(visit.note || '').trim();
      if (!storeName || !note) continue;

      // Match the live format used by POST /api/market-visits so the idempotency
      // check below correctly sees comments created by the live path and doesn't
      // re-insert a second (legacy-format) copy that the GET enrichment would
      // then render as a visible duplicate.
      const commentText = `[Market Visit — ${visit.visit_date} · ${storeName}] ${note}`;
      // Legacy variant (without the `· store` segment) used by historical
      // backfills and older POSTs. Keep it in the dedupe key set so we don't
      // re-insert when an older legacy copy already exists.
      const legacyText = `[Market Visit — ${visit.visit_date}] ${note}`;
      // Use the visit date (midday UTC) as a stable timestamp so backfilled
      // comments sort into roughly the right place in the comment history.
      const timestamp = visit.visit_date
        ? new Date(`${visit.visit_date}T12:00:00Z`).toISOString()
        : new Date().toISOString();

      // Pick the overall best match across BOTH top-level chain names and
      // every chain's subgrid. A weak cross-chain subgrid hit must never
      // pre-empt an exact chain-row name match on the correct chain — e.g.
      // "Kowalski's Woodbury" should land on the top-level Kowalski's row,
      // not on an L&B subgrid row that happens to share a city token.
      let matchedRow: any = null;
      let matchedSubRow: any = null;
      let bestScore = 0;

      const chainHit = bestMatch(rows as any[], (r: any) => r?.name, storeName);
      if (chainHit && chainHit.score > bestScore) {
        bestScore = chainHit.score;
        matchedRow = chainHit.item;
        matchedSubRow = null;
      }

      for (const r of rows) {
        const subRows = r?.subgrid?.rows;
        if (!Array.isArray(subRows)) continue;
        const hit = bestMatch(subRows as any[], (sr: any) => sr?.store_name, storeName);
        if (hit && hit.score > bestScore) {
          bestScore = hit.score;
          matchedRow = r;
          matchedSubRow = hit.item;
        }
      }

      if (!matchedRow) continue;

      const parentKey = `|${String(matchedRow.id)}|${commentText}`;
      const parentLegacyKey = `|${String(matchedRow.id)}|${legacyText}`;
      if (!existingKeys.has(parentKey) && !existingKeys.has(parentLegacyKey)) {
        inserts.push({
          scorecard_id: scorecardId,
          user_id: visit.user_id,
          user_email: '',
          row_id: String(matchedRow.id),
          text: commentText,
          created_at: timestamp,
          updated_at: timestamp,
        });
        existingKeys.add(parentKey);
      }

      // Chain-level match already picked a specific subrow. Otherwise pick the
      // single best-scoring subrow within the matched chain (no fan-out).
      const subRowsToComment: any[] = matchedSubRow
        ? [matchedSubRow]
        : (() => {
            const fanoutHit = bestMatch(
              (matchedRow.subgrid?.rows || []) as any[],
              (sr: any) => sr?.store_name,
              storeName,
            );
            return fanoutHit ? [fanoutHit.item] : [];
          })();

      for (const subRow of subRowsToComment) {
        if (!subRow?.store_name) continue;
        const subKey = `${String(matchedRow.id)}|${subRow.store_name}|${commentText}`;
        const subLegacyKey = `${String(matchedRow.id)}|${subRow.store_name}|${legacyText}`;
        if (existingKeys.has(subKey) || existingKeys.has(subLegacyKey)) continue;
        inserts.push({
          scorecard_id: scorecardId,
          user_id: visit.user_id,
          user_email: '',
          row_id: subRow.store_name,
          parent_row_id: String(matchedRow.id),
          text: commentText,
          created_at: timestamp,
          updated_at: timestamp,
        });
        existingKeys.add(subKey);
      }
    }

    if (inserts.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    // Resolve uploader emails so comment cards don't render "Unknown"
    const uploaderIds = Array.from(new Set(inserts.map((i) => i.user_id).filter(Boolean)));
    const emailsById: Record<string, string> = {};
    for (const uid of uploaderIds) {
      try {
        const { data: uData } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (uData?.user?.email) emailsById[uid] = uData.user.email;
      } catch {
        /* ignore */
      }
    }
    for (const ins of inserts) {
      ins.user_email = emailsById[ins.user_id] || '';
    }

    const { error: insertErr } = await supabaseAdmin.from('comments').insert(inserts);
    if (insertErr) {
      logger.error('Backfill comments insert failed:', insertErr);
      return NextResponse.json({ error: 'Failed to backfill comments' }, { status: 500 });
    }

    return NextResponse.json({ created: inserts.length });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
