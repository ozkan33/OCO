import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { logger } from '../../../../lib/logger';
import { createCommentSchema } from '../../../../lib/schemas';
import { z } from 'zod';

// Helper: verify or migrate a scorecard, returns { id, title }
async function resolveScorecard(
  scorecardId: string,
  userId: string,
  scorecardData?: { name?: string; columns?: any[]; rows?: any[] } | null,
) {
  if (scorecardId.startsWith('scorecard_')) {
    if (!scorecardData) throw new Error('Scorecard data required for migration');

    const { data, error } = await supabaseAdmin
      .from('user_scorecards')
      .insert({
        user_id: userId,
        title: scorecardData.name || 'Migrated Scorecard',
        data: { columns: scorecardData.columns || [], rows: scorecardData.rows || [] },
        is_draft: true,
      })
      .select('id, title')
      .single();

    if (error) throw error;
    return data;
  }

  // Database scorecard — only select id for ownership verification
  const { data, error } = await supabaseAdmin
    .from('user_scorecards')
    .select('id, title')
    .eq('id', scorecardId)
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error('Scorecard not found or access denied');
  return data;
}

// GET /api/comments
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const { searchParams } = new URL(request.url);
    const scorecardId = searchParams.get('scorecard_id');

    if (!scorecardId) {
      return NextResponse.json({ error: 'Scorecard ID is required' }, { status: 400 });
    }

    // Local scorecards can't have database comments
    if (scorecardId.startsWith('scorecard_')) {
      return NextResponse.json([]);
    }

    // Verify ownership
    const { error: scErr } = await supabaseAdmin
      .from('user_scorecards')
      .select('id')
      .eq('id', scorecardId)
      .eq('user_id', user.id)
      .single();

    if (scErr) {
      return NextResponse.json({ error: 'Scorecard not found or access denied' }, { status: 404 });
    }

    const { data: comments, error } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('scorecard_id', scorecardId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Database error fetching comments:', error);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    return NextResponse.json(comments);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/comments
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const body = await request.json();

    // Validate input
    const parsed = createCommentSchema.parse(body);
    const { scorecard_id, user_id: row_id, text, parent_row_id, scorecard_data } = parsed;

    // Resolve scorecard (verify ownership or migrate) — single query
    let scorecard;
    try {
      scorecard = await resolveScorecard(scorecard_id, user.id, scorecard_data);
    } catch {
      return NextResponse.json({ error: 'Scorecard not found or access denied' }, { status: 404 });
    }

    const insertData: any = {
      scorecard_id: scorecard.id,
      user_id: user.id,
      user_email: user.email || '',
      row_id: row_id,
      text: text.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (parent_row_id) insertData.parent_row_id = parent_row_id;

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error('Database error creating comment:', error);
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    // Notify brand users assigned to this scorecard
    try {
      const { data: scData } = await supabaseAdmin
        .from('user_scorecards')
        .select('data')
        .eq('id', scorecard.id)
        .single();

      const rows = scData?.data?.rows || [];
      const matchedRow = rows.find((r: { id: string | number }) => String(r.id) === String(row_id));
      const rowName = matchedRow?.name || `Row ${row_id}`;
      const scorecardName = scorecard.title || 'Untitled Scorecard';

      const { data: assignments } = await supabaseAdmin
        .from('brand_user_assignments')
        .select('user_id')
        .eq('scorecard_id', scorecard.id);

      if (assignments && assignments.length > 0) {
        const adminName = user.user_metadata?.name || user.email?.split('@')[0] || 'Admin';
        const message = `${adminName} added a note on ${rowName} in ${scorecardName}`;
        const notifs = assignments.map((a: { user_id: string }) => ({
          recipient_role: 'BRAND',
          recipient_user_id: a.user_id,
          actor_user_id: user.id,
          actor_name: adminName,
          action_type: 'comment_added',
          scorecard_id: scorecard.id,
          scorecard_name: scorecardName,
          row_id: String(row_id),
          row_name: rowName,
          comment_id: comment.id,
          message,
          is_read: false,
        }));

        const { error: notifErr } = await supabaseAdmin
          .from('notifications')
          .insert(notifs);

        if (notifErr) {
          logger.error('Failed to insert brand user notifications:', notifErr);
        }
      }
    } catch (notifError) {
      // Non-fatal: don't fail the comment creation
      logger.error('Error creating brand notifications:', notifError);
    }

    const response = {
      ...comment,
      row_id,
      migrated_scorecard: scorecard_id.startsWith('scorecard_')
        ? { old_id: scorecard_id, new_id: scorecard.id, title: scorecard.title }
        : null,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
