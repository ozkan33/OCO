import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';
import { updateCommentSchema } from '../../../../../lib/schemas';
import { z } from 'zod';

// Build & insert notifications for all brand users assigned to this scorecard.
// Used when admin edits a comment. Mirrors the `comment_added` fan-out in
// POST /api/comments. Deletes intentionally do NOT notify.
async function notifyBrandUsers(opts: {
  actionType: 'comment_updated';
  scorecardId: string;
  rowId: string;
  commentId: string;
  adminUserId: string;
  adminName: string;
  verb: 'edited';
}) {
  try {
    const { data: scData } = await supabaseAdmin
      .from('user_scorecards')
      .select('title, data')
      .eq('id', opts.scorecardId)
      .single();

    const rows = scData?.data?.rows || [];
    const matchedRow = rows.find(
      (r: { id: string | number }) => String(r.id) === String(opts.rowId),
    );
    const rowName = matchedRow?.name || `Row ${opts.rowId}`;
    const scorecardName = scData?.title || 'Untitled Scorecard';

    const { data: assignments } = await supabaseAdmin
      .from('brand_user_assignments')
      .select('user_id')
      .eq('scorecard_id', opts.scorecardId);

    if (!assignments || assignments.length === 0) return;

    const message = `${opts.adminName} ${opts.verb} a note on ${rowName} in ${scorecardName}`;
    const notifs = assignments.map((a: { user_id: string }) => ({
      recipient_role: 'BRAND',
      recipient_user_id: a.user_id,
      actor_user_id: opts.adminUserId,
      actor_name: opts.adminName,
      action_type: opts.actionType,
      scorecard_id: opts.scorecardId,
      scorecard_name: scorecardName,
      row_id: String(opts.rowId),
      row_name: rowName,
      comment_id: opts.commentId,
      message,
      is_read: false,
    }));

    const { error: notifErr } = await supabaseAdmin
      .from('notifications')
      .insert(notifs);
    if (notifErr) {
      logger.error(`Failed to insert ${opts.actionType} notifications:`, notifErr);
    }
  } catch (err) {
    logger.error(`Error creating ${opts.actionType} notifications:`, err);
  }
}

// PUT /api/comments/[id] - Update a comment
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromToken(request);
    const { id } = await params;
    const body = await request.json();

    const { text } = updateCommentSchema.parse(body);

    // Single query: update only if user owns it, return result
    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .update({ text: text.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !comment) {
      return NextResponse.json({ error: 'Comment not found or unauthorized' }, { status: 404 });
    }

    const adminName = user.user_metadata?.name || user.email?.split('@')[0] || 'Admin';
    await notifyBrandUsers({
      actionType: 'comment_updated',
      scorecardId: comment.scorecard_id,
      rowId: String(comment.row_id),
      commentId: comment.id,
      adminUserId: user.id,
      adminName,
      verb: 'edited',
    });

    return NextResponse.json(comment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }
    logger.error('Error in PUT /api/comments/[id]:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/comments/[id] - Delete a comment
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromToken(request);
    const { id } = await params;

    // Single query: delete only if user owns it
    const { data, error } = await supabaseAdmin
      .from('comments')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Comment not found or unauthorized' }, { status: 404 });
    }

    // Intentionally no notification on delete — brand users are not alerted
    // when the admin removes a note. The ON DELETE CASCADE on
    // notifications.comment_id also silently removes any prior "added" notice
    // for this comment.
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error('Error in DELETE /api/comments/[id]:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
