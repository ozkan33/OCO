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
    const { scorecard_id, row_id, text, parent_row_id, store_name } = parsed;

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

    // Insert comment (with optional subgrid context)
    const insertData: any = {
      scorecard_id,
      user_id: user.id,
      user_email: user.email,
      row_id: store_name || String(row_id), // Use store_name as row_id for subgrid comments
      text: text.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (parent_row_id || store_name) {
      // This is a store-level comment — find the parent row if not provided
      if (!parent_row_id && store_name) {
        const normalize = (s: string) => s.trim().toLowerCase().replace(/\s*&\s*/g, '&').replace(/\s+/g, ' ');
        const normalizedStore = normalize(store_name);
        const parentMatch = rows.find((r: any) => {
          const rn = normalize(String(r.name || ''));
          return normalizedStore.includes(rn) || rn.includes(normalizedStore);
        });
        if (parentMatch) insertData.parent_row_id = String(parentMatch.id);
      } else {
        insertData.parent_row_id = parent_row_id;
      }
    }

    const { data: comment, error: commentErr } = await supabaseAdmin
      .from('comments')
      .insert(insertData)
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

// PUT /api/portal/comments - Brand user edits their own comment
export async function PUT(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'BRAND') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id, text } = await request.json();
    if (!id || !text?.trim()) {
      return NextResponse.json({ error: 'Missing id or text' }, { status: 400 });
    }

    // Verify comment belongs to this user
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('comments')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only edit your own comments' }, { status: 403 });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('comments')
      .update({ text: text.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      logger.error('Failed to update portal comment:', updateErr);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/portal/comments - Brand user deletes their own comment
export async function DELETE(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'BRAND') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing comment id' }, { status: 400 });
    }

    // Verify comment belongs to this user
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('comments')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only delete your own comments' }, { status: 403 });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from('comments')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      logger.error('Failed to delete portal comment:', deleteErr);
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
