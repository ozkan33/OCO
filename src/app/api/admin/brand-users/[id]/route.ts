import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { updateBrandUserSchema } from '../../../../../../lib/schemas';
import { revokeUserAccess } from '../../../../../../lib/mfa/state';
import { resolveBrandScorecardId } from '../../../../../../lib/brandScorecards';

// PUT /api/admin/brand-users/[id] - Update a brand user
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getUserFromToken(request);
    if (admin.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateBrandUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { contactName, brandName, isActive, scorecardAssignments } = parsed.data;

    // Update profile
    const updates: Record<string, any> = {};
    if (contactName !== undefined) updates.contact_name = contactName;
    if (brandName !== undefined) updates.brand_name = brandName;
    if (isActive !== undefined) updates.is_active = isActive;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseAdmin
        .from('brand_user_profiles')
        .update(updates)
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update Supabase Auth metadata if brand name or name changed
    const metaUpdates: Record<string, any> = {};
    if (brandName) metaUpdates.brand = brandName;
    if (contactName) metaUpdates.name = contactName;
    if (Object.keys(metaUpdates).length > 0) {
      await supabaseAdmin.auth.admin.updateUserById(id, { user_metadata: metaUpdates });
    }

    // Handle reactivation (unban) or deactivation (ban)
    if (isActive === true) {
      await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: 'none' });
    } else if (isActive === false) {
      await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
      await revokeUserAccess(id);
    }

    // Update scorecard assignments if provided
    if (scorecardAssignments !== undefined) {
      const brand = brandName || (await supabaseAdmin.from('brand_user_profiles').select('brand_name').eq('id', id).single()).data?.brand_name;

      // Resolve every id BEFORE touching the existing assignments, so a bad
      // id leaves the user's current access intact instead of wiping it.
      const rows = [];
      for (const a of scorecardAssignments) {
        const resolvedId = await resolveBrandScorecardId(a.scorecardId, brand);
        if (!resolvedId) {
          return NextResponse.json(
            { error: 'One of the selected scorecards could not be found. Reload the page and try again.' },
            { status: 400 },
          );
        }
        rows.push({
          user_id: id,
          brand_name: brand || '',
          scorecard_id: resolvedId,
          product_columns: a.productColumns,
          assigned_by: admin.id,
        });
      }

      await supabaseAdmin.from('brand_user_assignments').delete().eq('user_id', id);
      if (rows.length > 0) {
        const { error: assignErr } = await supabaseAdmin.from('brand_user_assignments').insert(rows);
        if (assignErr) {
          return NextResponse.json({ error: 'Failed to save scorecard access. Please try again.' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/admin/brand-users/[id] - Deactivate or permanently delete a brand user
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getUserFromToken(request);
    if (admin.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Check if permanent delete was requested
    let permanent = false;
    try { const body = await request.json(); permanent = body?.permanent === true; } catch { /* no body = soft delete */ }

    if (permanent) {
      // Permanent delete — remove from all tables and Supabase Auth.
      // comments.user_id FK to auth.users is NOT cascading, so we must
      // remove them here or auth.admin.deleteUser fails with
      // "Database error deleting user" and leaves an orphan auth row
      // that still blocks the email from being reused.
      await supabaseAdmin.from('brand_user_assignments').delete().eq('user_id', id);
      await supabaseAdmin.from('login_sessions').delete().eq('user_id', id);
      await supabaseAdmin.from('trusted_devices').delete().eq('user_id', id);
      await supabaseAdmin.from('user_totp_secrets').delete().eq('user_id', id);
      await supabaseAdmin.from('comments').delete().eq('user_id', id);
      await supabaseAdmin.from('brand_user_profiles').delete().eq('id', id);

      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (authErr) {
        return NextResponse.json(
          { error: `Failed to delete auth user: ${authErr.message}` },
          { status: 500 },
        );
      }
    } else {
      // Soft delete — deactivate and ban
      await supabaseAdmin.from('brand_user_profiles').update({ is_active: false }).eq('id', id);
      await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
      // A ban only stops new tokens; this cuts off the ones already issued.
      await revokeUserAccess(id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
