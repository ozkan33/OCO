import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { logger } from '../../../../lib/logger';
import { Capability, getRoleFromUser, hasCapability } from '../../../../lib/rbac';

// ADMIN and KEY_ACCOUNT_MANAGER share a single team-wide scorecard pool —
// there is no per-user ownership carve-out. BRAND clients read scorecards via
// /api/portal/* routes and never reach these endpoints.

// GET /api/scorecards - List all scorecards visible to the caller
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = getRoleFromUser(user);
    if (!hasCapability(role, Capability.SCORECARD_READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: scorecards, error } = await supabaseAdmin
      .from('user_scorecards')
      .select('*')
      .order('last_modified', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(scorecards);
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/scorecards - Create a new scorecard
export async function POST(request: Request) {
  try {
    logger.debug('POST /api/scorecards - Starting request');
    const user = await getUserFromToken(request);
    const role = getRoleFromUser(user);
    if (!hasCapability(role, Capability.SCORECARD_WRITE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    logger.debug('User from token:', user);

    const body = await request.json();
    logger.debug('Request body:', body);

    const { title, vendor_id, data: scorecardData } = body;

    const insertData = {
      user_id: user.id,
      title: title || 'Untitled Scorecard',
      vendor_id: vendor_id || null,
      data: scorecardData || {},
      is_draft: true,
    };
    logger.debug('Insert data:', insertData);

    const { data: scorecard, error } = await supabaseAdmin
      .from('user_scorecards')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logger.debug('Created scorecard:', scorecard);
    return NextResponse.json(scorecard, { status: 201 });
  } catch (error) {
    logger.error('Catch error:', error);
    return NextResponse.json({ error: (error as Error).message || 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/scorecards - Update/upsert a scorecard (for auto-save)
export async function PUT(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = getRoleFromUser(user);
    if (!hasCapability(role, Capability.SCORECARD_WRITE)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();

    const { id, title, vendor_id, data: scorecardData, is_draft } = body;

    const updateData = {
      title: title || 'Untitled Scorecard',
      vendor_id: vendor_id || null,
      data: scorecardData || {},
      is_draft: is_draft !== undefined ? is_draft : true,
      last_modified: new Date().toISOString(),
      version: 1, // Start with version 1, will be incremented by database
    };

    if (id) {
      // Update existing scorecard (any ADMIN/KAM may update any scorecard in
      // the shared pool — no per-row user_id filter).
      const { data: scorecard, error } = await supabaseAdmin
        .from('user_scorecards')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(scorecard);
    } else {
      // Create new scorecard — creator becomes owner.
      const { data: scorecard, error } = await supabaseAdmin
        .from('user_scorecards')
        .insert({ ...updateData, user_id: user.id })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(scorecard, { status: 201 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
