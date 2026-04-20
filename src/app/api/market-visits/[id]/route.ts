import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';
import { Capability, hasCapability, getRoleFromUser } from '../../../../../lib/rbac';

// Authorize a caller to mutate a specific visit. ADMIN has manage_any and
// passes unconditionally; internal roles (KAM / FSR) must own the visit.
async function authorizeMutation(request: Request, visitId: string) {
  let user;
  try {
    user = await getUserFromToken(request);
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const role = getRoleFromUser(user);

  // Everyone who can reach this endpoint needs at least the capability to
  // create market visits — readers (e.g. BRAND) are never allowed to mutate.
  if (!hasCapability(role, Capability.MARKET_VISITS_CREATE)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  if (hasCapability(role, Capability.MARKET_VISITS_MANAGE_ANY)) {
    return { user };
  }

  // Non-admin: require ownership
  const { data: visit } = await supabaseAdmin
    .from('market_visits')
    .select('user_id')
    .eq('id', visitId)
    .single();
  if (!visit) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  if (visit.user_id !== user.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}

// PUT /api/market-visits/[id] - Update visit metadata
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorizeMutation(request, id);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const updates: Record<string, any> = {};
    if (body.store_name !== undefined) updates.store_name = body.store_name;
    if (body.address !== undefined) updates.address = body.address;
    if (body.visit_date !== undefined) {
      if (typeof body.visit_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.visit_date)) {
        return NextResponse.json({ error: 'Invalid visit_date (YYYY-MM-DD)' }, { status: 400 });
      }
      updates.visit_date = body.visit_date;
    }
    if (body.note !== undefined) updates.note = body.note;
    if (body.brands !== undefined) {
      if (!Array.isArray(body.brands) || body.brands.length === 0) {
        return NextResponse.json({ error: 'At least one brand is required' }, { status: 400 });
      }
      updates.brands = body.brands;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('market_visits')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Market visit update failed:', error);
      return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 });
    }

    // Sync note changes to auto-generated comments linked by market_visit_id.
    // Using the id avoids the same-day prefix-match bug where two visits on
    // the same date clobbered each other's auto-comment text.
    if (body.note !== undefined) {
      try {
        const newText = `[Market Visit — ${updated.visit_date} · ${updated.store_name || ''}] ${body.note}`;
        const { data: updatedComments, error: syncErr } = await supabaseAdmin
          .from('comments')
          .update({ text: newText, updated_at: new Date().toISOString() })
          .eq('market_visit_id', id)
          .select('id, scorecard_id, row_id, parent_row_id');

        if (syncErr) logger.error('Comment sync failed:', syncErr);

        // Notify brand users that the note was edited. Mirrors POST fan-out
        // but only on parent-row comments — subgrid comments share the same
        // text and would just duplicate the notification per store.
        const parentComments = (updatedComments || []).filter((c) => !c.parent_row_id);
        if (parentComments.length > 0) {
          const actor = auth.user!;
          const adminName = actor.user_metadata?.name || actor.email?.split('@')[0] || 'Admin';

          const scorecardIds = Array.from(new Set(parentComments.map((c) => c.scorecard_id)));
          const [{ data: scorecards }, { data: assignments }] = await Promise.all([
            supabaseAdmin
              .from('user_scorecards')
              .select('id, title, data')
              .in('id', scorecardIds),
            supabaseAdmin
              .from('brand_user_assignments')
              .select('user_id, scorecard_id')
              .in('scorecard_id', scorecardIds),
          ]);

          const scorecardById = new Map((scorecards || []).map((s: any) => [s.id, s]));
          const usersByScorecard = new Map<string, string[]>();
          for (const a of (assignments || []) as { user_id: string; scorecard_id: string }[]) {
            const list = usersByScorecard.get(a.scorecard_id) || [];
            list.push(a.user_id);
            usersByScorecard.set(a.scorecard_id, list);
          }

          const notifs: any[] = [];
          for (const c of parentComments) {
            const sc: any = scorecardById.get(c.scorecard_id);
            const userIds = usersByScorecard.get(c.scorecard_id) || [];
            if (!sc || userIds.length === 0) continue;

            const matchedRow = (sc.data?.rows || []).find(
              (r: any) => String(r.id) === c.row_id,
            );
            const rowName = matchedRow?.name || `Row ${c.row_id}`;
            const storeLabel = updated.store_name || rowName;
            const message = `${adminName} edited a market visit note on ${storeLabel} in ${sc.title}`;

            for (const uid of userIds) {
              notifs.push({
                recipient_role: 'BRAND',
                recipient_user_id: uid,
                actor_user_id: actor.id,
                actor_name: adminName,
                action_type: 'market_visit_comment_updated',
                scorecard_id: sc.id,
                scorecard_name: sc.title,
                row_id: c.row_id,
                row_name: rowName,
                store_name: updated.store_name || null,
                comment_id: c.id,
                message,
                is_read: false,
              });
            }
          }

          if (notifs.length > 0) {
            const { error: notifErr } = await supabaseAdmin
              .from('notifications')
              .insert(notifs);
            if (notifErr) logger.error('Market visit update notification failed:', notifErr);
          }
        }
      } catch (syncErr) {
        logger.error('Comment sync error:', syncErr);
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    logger.error('Market visit PUT failed:', err);
    return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 });
  }
}

// DELETE /api/market-visits/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorizeMutation(request, id);
  if (auth.error) return auth.error;

  try {
    // Fetch the visit
    const { data: visit, error: fetchError } = await supabaseAdmin
      .from('market_visits')
      .select('id, photo_storage_path')
      .eq('id', id)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // Delete from storage
    await supabaseAdmin.storage
      .from('market-photos')
      .remove([visit.photo_storage_path]);

    // Delete database row
    const { error: deleteError } = await supabaseAdmin
      .from('market_visits')
      .delete()
      .eq('id', id);

    if (deleteError) {
      logger.error('Market visit delete failed:', deleteError);
      return NextResponse.json({ error: 'Failed to delete visit' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Market visit DELETE failed:', err);
    return NextResponse.json({ error: 'Failed to delete visit' }, { status: 500 });
  }
}
