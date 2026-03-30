import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';

// PATCH /api/scorecards/[id]/cells
// Body: { changes: [{ rowId: number, columnKey: string, value: string }] }
// Upserts individual cells. Used by auto-save for cell-level granularity.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    const { id: scorecardId } = await params;
    const body = await request.json();
    const changes: { rowId: number; columnKey: string; value: string }[] = body.changes ?? [];

    if (!changes.length) {
      return NextResponse.json({ updated: 0 });
    }

    // Verify ownership
    const { data: sc, error: scErr } = await supabaseAdmin
      .from('user_scorecards')
      .select('id')
      .eq('id', scorecardId)
      .eq('user_id', user.id)
      .single();

    if (scErr || !sc) {
      return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
    }

    // Upsert each changed cell
    const upserts = changes.map(c => ({
      scorecard_id: scorecardId,
      row_id: c.rowId,
      column_key: c.columnKey,
      value: c.value ?? '',
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }));

    const { error } = await supabaseAdmin
      .from('scorecard_cells')
      .upsert(upserts, { onConflict: 'scorecard_id,row_id,column_key' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ updated: upserts.length });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/scorecards/[id]/cells/rows — add a row
// Body: { rowId: number, position: number }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    const { id: scorecardId } = await params;
    const { rowId, position } = await request.json();

    const { data: sc, error: scErr } = await supabaseAdmin
      .from('user_scorecards')
      .select('id')
      .eq('id', scorecardId)
      .eq('user_id', user.id)
      .single();

    if (scErr || !sc) {
      return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('scorecard_rows')
      .insert({ id: rowId, scorecard_id: scorecardId, position: position ?? 0 });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rowId });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/scorecards/[id]/cells?rowId=123 — delete a row and all its cells
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    const { id: scorecardId } = await params;
    const { searchParams } = new URL(request.url);
    const rowId = searchParams.get('rowId');

    if (!rowId) {
      return NextResponse.json({ error: 'rowId required' }, { status: 400 });
    }

    const { data: sc, error: scErr } = await supabaseAdmin
      .from('user_scorecards')
      .select('id')
      .eq('id', scorecardId)
      .eq('user_id', user.id)
      .single();

    if (scErr || !sc) {
      return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
    }

    // Cells deleted automatically via CASCADE
    const { error } = await supabaseAdmin
      .from('scorecard_rows')
      .delete()
      .eq('scorecard_id', scorecardId)
      .eq('id', parseInt(rowId, 10));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: rowId });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
