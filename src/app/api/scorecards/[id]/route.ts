import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { Capability, getRoleFromUser, hasCapability } from '../../../../../lib/rbac';

// GET /api/scorecards/[id] - Get a specific scorecard
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromToken(request);
    const role = getRoleFromUser(user);
    if (!hasCapability(role, Capability.SCORECARD_READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;

    const { data: scorecard, error } = await supabaseAdmin
      .from('user_scorecards')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(scorecard);
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// PUT /api/scorecards/[id] - Update a specific scorecard
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromToken(request);
    const role = getRoleFromUser(user);
    if (!hasCapability(role, Capability.SCORECARD_WRITE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { id } = await params;

    const { title, vendor_id, data: scorecardData, is_draft } = body;

    const updateData = {
      title: title || 'Untitled Scorecard',
      vendor_id: vendor_id || null,
      data: scorecardData || {},
      is_draft: is_draft !== undefined ? is_draft : true,
      last_modified: new Date().toISOString(),
    };

    const { data: scorecard, error } = await supabaseAdmin
      .from('user_scorecards')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(scorecard);
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/scorecards/[id] - Admin-only: delete a specific scorecard.
// KAM has SCORECARD_WRITE but not SCORECARD_DELETE, so the capability check
// keeps them out even though they can otherwise edit scorecards freely.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromToken(request);
    const role = getRoleFromUser(user);
    if (!hasCapability(role, Capability.SCORECARD_DELETE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;

    const { error } = await supabaseAdmin
      .from('user_scorecards')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Scorecard deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
