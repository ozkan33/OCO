import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { updateBrandUserSchema } from '../../../../../../lib/schemas';

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
    }

    // Update scorecard assignments if provided
    if (scorecardAssignments !== undefined) {
      // Delete existing assignments
      await supabaseAdmin.from('brand_user_assignments').delete().eq('user_id', id);

      // Insert new assignments with validated scorecard IDs
      if (scorecardAssignments.length > 0) {
        const brand = brandName || (await supabaseAdmin.from('brand_user_profiles').select('brand_name').eq('id', id).single()).data?.brand_name;

        // Fetch all admin's scorecards to validate IDs and resolve mismatches
        const { data: adminScorecards } = await supabaseAdmin
          .from('user_scorecards')
          .select('id, title, data')
          .eq('user_id', admin.id);

        const rows = scorecardAssignments.map(a => {
          let resolvedId = a.scorecardId;

          // Check if this ID matches a real scorecard with data
          const directMatch = (adminScorecards || []).find((sc: any) => sc.id === a.scorecardId);
          if (!directMatch || !directMatch.data?.rows?.length) {
            // ID doesn't match or scorecard is empty — find the real one by product columns
            const realMatch = (adminScorecards || []).find((sc: any) => {
              if (!sc.data?.rows?.length) return false; // skip empty scorecards
              const scCols = (sc.data?.columns || []).filter((c: any) => c.isDefault !== true).map((c: any) => c.key);
              return a.productColumns.length > 0 && a.productColumns.some((pc: string) => scCols.includes(pc));
            });
            if (realMatch) resolvedId = realMatch.id;
          }

          return {
            user_id: id,
            brand_name: brand || '',
            scorecard_id: resolvedId,
            product_columns: a.productColumns,
            assigned_by: admin.id,
          };
        });

        await supabaseAdmin.from('brand_user_assignments').insert(rows);
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
      // Permanent delete — remove from all tables and Supabase Auth
      await supabaseAdmin.from('brand_user_assignments').delete().eq('user_id', id);
      await supabaseAdmin.from('login_sessions').delete().eq('user_id', id);
      await supabaseAdmin.from('trusted_devices').delete().eq('user_id', id);
      await supabaseAdmin.from('user_totp_secrets').delete().eq('user_id', id);
      await supabaseAdmin.from('brand_user_profiles').delete().eq('id', id);
      await supabaseAdmin.auth.admin.deleteUser(id);
    } else {
      // Soft delete — deactivate and ban
      await supabaseAdmin.from('brand_user_profiles').update({ is_active: false }).eq('id', id);
      await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
