import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { Capability, getRoleFromUser, hasCapability } from '../../../../../../lib/rbac';

type CellChange = {
  rowId: number | string;
  columnKey: string;
  value: any;
  parentRowId?: number | string;
  subRowId?: number | string;
};

const MAX_ATTEMPTS = 4;

// PATCH /api/scorecards/[id]/cells
// Granular cell-level save: applies deltas to the JSONB data blob.
// Body: { changes: [{ rowId, columnKey, value, parentRowId?, subRowId? }] }
//
// The deltas are merged onto whatever the server holds NOW, so two people
// editing different cells of the same scorecard never undo each other. A
// newer server copy is therefore not a conflict; the only 409 is "none of
// these rows exist any more". The write is conditional on last_modified and
// retried, so two simultaneous PATCHes cannot lose one another's cells either.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    const role = getRoleFromUser(user);
    if (!hasCapability(role, Capability.SCORECARD_WRITE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id: scorecardId } = await params;
    const body = await request.json();
    const changes: CellChange[] = body.changes ?? [];

    if (!changes.length) {
      return NextResponse.json({ updated: 0 });
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Read current scorecard — shared across ADMIN+KAM, no per-user filter.
      const { data: sc, error: scErr } = await supabaseAdmin
        .from('user_scorecards')
        .select('id, data, last_modified')
        .eq('id', scorecardId)
        .single();

      if (scErr || !sc) {
        return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
      }

      const data = sc.data || {};
      const rows: any[] = data.rows || [];
      let applied = 0;

      for (const change of changes) {
        if (change.parentRowId !== undefined && change.subRowId !== undefined) {
          // Subgrid cell delta
          const parentRow = rows.find((r: any) => String(r.id) === String(change.parentRowId));
          const subRow = parentRow?.subgrid?.rows?.find((sr: any) => String(sr.id) === String(change.subRowId));
          if (subRow) {
            subRow[change.columnKey] = change.value;
            applied++;
          }
        } else {
          // Main grid cell delta
          const row = rows.find((r: any) => String(r.id) === String(change.rowId));
          if (row) {
            row[change.columnKey] = change.value;
            applied++;
          }
        }
      }

      if (applied === 0) {
        // No rows matched — likely stale deltas; tell client to do a full save
        return NextResponse.json(
          { error: 'No matching rows', serverLastModified: sc.last_modified },
          { status: 409 }
        );
      }

      // Only write if nobody saved since our read; otherwise re-read and re-apply.
      const now = new Date().toISOString();
      const write = supabaseAdmin
        .from('user_scorecards')
        .update({ data: { ...data, rows }, last_modified: now })
        .eq('id', scorecardId);
      const { data: written, error: updateErr } = await (sc.last_modified == null
        ? write.is('last_modified', null)
        : write.eq('last_modified', sc.last_modified)
      ).select('id');

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      if (written && written.length > 0) {
        return NextResponse.json({ updated: applied, last_modified: now });
      }
    }

    return NextResponse.json({ error: 'The scorecard is being saved by someone else. Please try again.' }, { status: 503 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
