import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { Capability, getRoleFromUser, hasCapability } from '../../../../../../lib/rbac';

// GET /api/scorecards/[id]/history?rowId=123&limit=50
// Returns the change history for a row (or whole scorecard if rowId omitted).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromToken(request);
    const role = getRoleFromUser(user);
    if (!hasCapability(role, Capability.SCORECARD_READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id: scorecardId } = await params;
    const { searchParams } = new URL(request.url);
    const rowId = searchParams.get('rowId');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

    const { data: sc, error: scErr } = await supabaseAdmin
      .from('user_scorecards')
      .select('id')
      .eq('id', scorecardId)
      .single();

    if (scErr || !sc) {
      return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
    }

    let query = supabaseAdmin
      .from('scorecard_cell_history')
      .select(`
        id, row_id, column_key, old_value, new_value, changed_at,
        changed_by
      `)
      .eq('scorecard_id', scorecardId)
      .order('changed_at', { ascending: false })
      .limit(limit);

    if (rowId) {
      query = query.eq('row_id', parseInt(rowId, 10));
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
