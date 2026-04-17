import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';
import { portalCommentSchema } from '../../../../../lib/schemas';
import { z } from 'zod';

// Notify the admin when a brand user edits a comment. Mirrors the
// subgrid-aware metadata the POST handler attaches so the admin can jump
// directly to the right retailer row (and subgrid store, if applicable).
// Deletes intentionally do NOT notify the admin.
async function notifyAdmin(opts: {
  actionType: 'comment_updated';
  verb: 'edited';
  commentRow: {
    id: string;
    scorecard_id: string;
    row_id: string;
    parent_row_id: string | null;
  };
  actorUserId: string;
  actorName: string;
  commentId: string;
}) {
  try {
    const { data: scorecard } = await supabaseAdmin
      .from('user_scorecards')
      .select('title, data')
      .eq('id', opts.commentRow.scorecard_id)
      .single();

    const scorecardName = scorecard?.title || 'Untitled Scorecard';
    const rows = scorecard?.data?.rows || [];

    const isSubgrid = !!opts.commentRow.parent_row_id;
    const parentRow = isSubgrid
      ? rows.find(
          (r: { id: string | number }) =>
            String(r.id) === String(opts.commentRow.parent_row_id),
        )
      : null;
    const retailerRow = !isSubgrid
      ? rows.find(
          (r: { id: string | number }) =>
            String(r.id) === String(opts.commentRow.row_id),
        )
      : null;

    // Subgrid comments store the store_name in `row_id`; retailer comments
    // store the retailer row id there.
    const storeName = isSubgrid ? String(opts.commentRow.row_id) : null;
    const notifRowId = isSubgrid
      ? String(opts.commentRow.parent_row_id)
      : String(opts.commentRow.row_id);
    const notifRowName = isSubgrid
      ? (parentRow?.name
          ? `${storeName || 'Store Visit'} (${parentRow.name})`
          : (storeName || 'Store Visit'))
      : (retailerRow?.name || `Row ${opts.commentRow.row_id}`);

    const message = `${opts.actorName} ${opts.verb} a note on ${notifRowName} in ${scorecardName}`;

    const { error: notifErr } = await supabaseAdmin
      .from('notifications')
      .insert({
        recipient_role: 'ADMIN',
        actor_user_id: opts.actorUserId,
        actor_name: opts.actorName,
        action_type: opts.actionType,
        scorecard_id: opts.commentRow.scorecard_id,
        scorecard_name: scorecardName,
        row_id: notifRowId,
        row_name: notifRowName,
        parent_row_id: isSubgrid ? opts.commentRow.parent_row_id : null,
        store_name: storeName,
        comment_id: opts.commentId,
        message,
        is_read: false,
      });
    if (notifErr) {
      logger.error(`Failed to insert ${opts.actionType} notification:`, notifErr);
    }
  } catch (err) {
    logger.error(`Error creating ${opts.actionType} admin notification:`, err);
  }
}

async function resolveBrandActorName(user: {
  id: string;
  email?: string | null;
}): Promise<string> {
  const { data: profile } = await supabaseAdmin
    .from('brand_user_profiles')
    .select('brand_name, contact_name')
    .eq('id', user.id)
    .single();
  return (
    profile?.brand_name ||
    profile?.contact_name ||
    user.email ||
    'Brand User'
  );
}

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
    const scorecardName = scorecard.title || 'Untitled Scorecard';

    // Resolve parent row for subgrid comments (normalized match on retailer name)
    const isSubgridComment = !!(parent_row_id || store_name);
    let resolvedParentRowId: string | null = parent_row_id || null;
    let resolvedParentRowName: string | null = null;

    if (isSubgridComment && store_name && !resolvedParentRowId) {
      const normalize = (s: string) => s.trim().toLowerCase().replace(/\s*&\s*/g, '&').replace(/\s+/g, ' ');
      const normalizedStore = normalize(store_name);
      // Prefer a subgrid store match: find the retailer whose subgrid rows
      // actually contain a store with this name. This avoids false positives
      // from retailer name substring overlap (e.g. "L&B CHANHASSEN" incorrectly
      // matching the "L&B" retailer when the store actually lives under
      // "Lunds&Byerlys").
      let parentMatch: any = null;
      for (const r of rows as any[]) {
        const subRows = r?.subgrid?.rows;
        if (!Array.isArray(subRows)) continue;
        const sub = subRows.find((sr: any) => {
          const subName = normalize(String(sr.store_name || ''));
          return subName && (subName === normalizedStore || subName.includes(normalizedStore) || normalizedStore.includes(subName));
        });
        if (sub) { parentMatch = r; break; }
      }
      // Fall back to retailer-name match only when no subgrid contained the store.
      if (!parentMatch) {
        parentMatch = rows.find((r: any) => {
          const rn = normalize(String(r.name || ''));
          return rn && (normalizedStore.includes(rn) || rn.includes(normalizedStore));
        });
      }
      if (parentMatch) {
        resolvedParentRowId = String(parentMatch.id);
        resolvedParentRowName = parentMatch.name || null;
      }
    } else if (resolvedParentRowId) {
      const parentMatch = rows.find((r: { id: string | number }) => String(r.id) === String(resolvedParentRowId));
      resolvedParentRowName = parentMatch?.name || null;
    }

    // Retailer-level row name (used by non-subgrid comments for display)
    const retailerRow = rows.find((r: { id: string | number }) => String(r.id) === String(row_id));
    const rowName = isSubgridComment
      ? (store_name || resolvedParentRowName || 'Store Visit')
      : (retailerRow?.name || `Row ${row_id}`);

    // Insert comment (with optional subgrid context)
    const insertData: any = {
      scorecard_id,
      user_id: user.id,
      user_email: user.email,
      row_id: isSubgridComment ? (store_name || String(row_id)) : String(row_id),
      text: text.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (resolvedParentRowId) {
      insertData.parent_row_id = resolvedParentRowId;
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
    // For subgrid comments, navigate via parent retailer row so the admin
    // lands on the correct retailer and auto-expands the subgrid store.
    const notifRowId = isSubgridComment && resolvedParentRowId
      ? resolvedParentRowId
      : String(row_id);
    const notifRowName = isSubgridComment
      ? (resolvedParentRowName
          ? `${store_name || rowName} (${resolvedParentRowName})`
          : (store_name || rowName))
      : rowName;
    const message = `${actorName} added a note on ${notifRowName} in ${scorecardName}`;

    const { error: notifErr } = await supabaseAdmin
      .from('notifications')
      .insert({
        recipient_role: 'ADMIN',
        actor_user_id: user.id,
        actor_name: actorName,
        action_type: 'comment_added',
        scorecard_id,
        scorecard_name: scorecardName,
        row_id: notifRowId,
        row_name: notifRowName,
        parent_row_id: isSubgridComment ? resolvedParentRowId : null,
        store_name: isSubgridComment ? (store_name || null) : null,
        comment_id: comment.id,
        message,
        is_read: false,
      });

    if (notifErr) {
      // Non-fatal: log but don't fail the request
      logger.error('Failed to insert notification:', notifErr);
    }

    const displayName = (profile?.contact_name && profile.contact_name.trim())
      || ((user.email || '').split('@')[0].replace(/^./, (c) => c.toUpperCase()))
      || 'Brand User';

    return NextResponse.json({
      ...comment,
      author: displayName,
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
      .select('id, user_id, scorecard_id, row_id, parent_row_id')
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

    const actorName = await resolveBrandActorName(user);
    await notifyAdmin({
      actionType: 'comment_updated',
      verb: 'edited',
      commentRow: {
        id: existing.id,
        scorecard_id: existing.scorecard_id,
        row_id: existing.row_id,
        parent_row_id: existing.parent_row_id ?? null,
      },
      actorUserId: user.id,
      actorName,
      commentId: existing.id,
    });

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

    // Intentionally no notification on delete — admin is not alerted when a
    // brand user removes a note. The ON DELETE CASCADE on
    // notifications.comment_id also silently removes any prior "added"
    // notice for this comment.
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
