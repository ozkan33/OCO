import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';
import { portalCommentSchema } from '../../../../../lib/schemas';
import { z } from 'zod';

// POST /api/portal/comments - Brand user adds a comment/note
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = user.user_metadata?.role;

    if (role !== 'BRAND') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = portalCommentSchema.parse(body);
    const { scorecard_id, row_id, text } = parsed;

    // Verify user is assigned to this scorecard
    const { data: assignment, error: assignErr } = await supabaseAdmin
      .from('brand_user_assignments')
      .select('id')
      .eq('user_id', user.id)
      .eq('scorecard_id', scorecard_id)
      .single();

    if (assignErr || !assignment) {
      return NextResponse.json({ error: 'Not assigned to this scorecard' }, { status: 403 });
    }

    // Get brand profile for actor_name
    const { data: profile } = await supabaseAdmin
      .from('brand_user_profiles')
      .select('brand_name, contact_name')
      .eq('id', user.id)
      .single();

    const actorName = profile?.brand_name || profile?.contact_name || user.email || 'Brand User';

    // Get scorecard for name and row data
    const { data: scorecard, error: scErr } = await supabaseAdmin
      .from('user_scorecards')
      .select('id, title, data')
      .eq('id', scorecard_id)
      .single();

    if (scErr || !scorecard) {
      return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
    }

    // Find the row name from the scorecard JSONB data
    const rows = scorecard.data?.rows || [];
    const matchedRow = rows.find((r: { id: string | number }) => String(r.id) === String(row_id));
    const rowName = matchedRow?.name || `Row ${row_id}`;
    const scorecardName = scorecard.title || 'Untitled Scorecard';

    // Insert comment
    const { data: comment, error: commentErr } = await supabaseAdmin
      .from('comments')
      .insert({
        scorecard_id,
        user_id: user.id,
        user_email: user.email,
        row_id: String(row_id),
        text: text.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (commentErr) {
      logger.error('Failed to insert portal comment:', commentErr);
      return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }

    // Insert notification for admins
    const message = `${actorName} added a note on ${rowName} in ${scorecardName}`;

    const { error: notifErr } = await supabaseAdmin
      .from('notifications')
      .insert({
        recipient_role: 'ADMIN',
        actor_user_id: user.id,
        actor_name: actorName,
        action_type: 'comment_added',
        scorecard_id,
        scorecard_name: scorecardName,
        row_id: String(row_id),
        row_name: rowName,
        comment_id: comment.id,
        message,
        is_read: false,
      });

    if (notifErr) {
      // Non-fatal: log but don't fail the request
      logger.error('Failed to insert notification:', notifErr);
    }

    return NextResponse.json({
      ...comment,
      author: user.email,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', issues: error.issues }, { status: 400 });
    }
    logger.error('Portal comment error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
