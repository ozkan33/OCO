import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';

// PATCH /api/scorecards/[id]/cells
// Granular cell-level save: applies deltas to the JSONB data blob.
// Body: {
//   changes: [{ rowId, columnKey, value, parentRowId?, subRowId? }],
//   expectedLastModified?: string  // optimistic concurrency check
// }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    const { id: scorecardId } = await params;
    const body = await request.json();
    const changes: {
      rowId: number | string;
      columnKey: string;
      value: any;
      parentRowId?: number | string;
      subRowId?: number | string;
    }[] = body.changes ?? [];

    if (!changes.length) {
      return NextResponse.json({ updated: 0 });
    }

    // Read current scorecard (verify ownership)
    const { data: sc, error: scErr } = await supabaseAdmin
      .from('user_scorecards')
      .select('id, data, last_modified')
      .eq('id', scorecardId)
      .eq('user_id', user.id)
      .single();

    if (scErr || !sc) {
      return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
    }

    // Optimistic concurrency check
    if (body.expectedLastModified) {
      const serverTime = new Date(sc.last_modified).getTime();
      const clientTime = new Date(body.expectedLastModified).getTime();
      // Allow 2s tolerance for clock skew
      if (serverTime > clientTime + 2000) {
        return NextResponse.json(
          { error: 'Conflict', serverLastModified: sc.last_modified },
          { status: 409 }
        );
      }
    }

    // Apply deltas to the JSONB data
    const data = sc.data || {};
    const rows: any[] = data.rows || [];

    let applied = 0;

    for (const change of changes) {
      if (change.parentRowId !== undefined && change.subRowId !== undefined) {
        // Subgrid cell delta
        const parentRow = rows.find((r: any) => String(r.id) === String(change.parentRowId));
        if (parentRow?.subgrid?.rows) {
          const subRow = parentRow.subgrid.rows.find((sr: any) => String(sr.id) === String(change.subRowId));
          if (subRow) {
            subRow[change.columnKey] = change.value;
            applied++;
          }
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

    // Write back the modified data
    const now = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from('user_scorecards')
      .update({ data: { ...data, rows }, last_modified: now })
      .eq('id', scorecardId)
      .eq('user_id', user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ updated: applied, last_modified: now });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
