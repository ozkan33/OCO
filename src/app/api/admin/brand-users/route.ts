import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { createBrandUserSchema } from '../../../../../lib/schemas';
import { features } from '../../../../../lib/features';

// GET /api/admin/brand-users - List all brand users
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (user.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: profiles, error } = await supabaseAdmin
      .from('brand_user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get assignments for each user
    const userIds = (profiles || []).map((p: any) => p.id);
    const { data: assignments } = await supabaseAdmin
      .from('brand_user_assignments')
      .select('*')
      .in('user_id', userIds.length > 0 ? userIds : ['none']);

    const result = (profiles || []).map((p: any) => ({
      ...p,
      assignments: (assignments || []).filter((a: any) => a.user_id === p.id),
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/admin/brand-users - Create a new brand user
export async function POST(request: Request) {
  try {
    const admin = await getUserFromToken(request);
    if (admin.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createBrandUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { email, contactName, brandName, tempPassword, scorecardAssignments } = parsed.data;

    // Create user in Supabase Auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        role: 'BRAND',
        brand: brandName,
        name: contactName,
        must_change_password: features.ENABLE_FORCED_PASSWORD_CHANGE,
      },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('brand_user_profiles')
      .insert({
        id: newUser.user.id,
        brand_name: brandName,
        contact_name: contactName,
        email,
        must_change_password: features.ENABLE_FORCED_PASSWORD_CHANGE,
        created_by: admin.id,
      });

    if (profileError) {
      // Cleanup: delete auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    // Create scorecard assignments with validated IDs
    if (scorecardAssignments.length > 0) {
      // Fetch admin's scorecards to validate/resolve IDs
      const { data: adminScorecards } = await supabaseAdmin
        .from('user_scorecards')
        .select('id, title, data')
        .eq('user_id', admin.id);

      const assignmentRows = scorecardAssignments.map(a => {
        let resolvedId = a.scorecardId;
        const directMatch = (adminScorecards || []).find((sc: any) => sc.id === a.scorecardId);
        if (!directMatch || !directMatch.data?.rows?.length) {
          const realMatch = (adminScorecards || []).find((sc: any) => {
            if (!sc.data?.rows?.length) return false;
            const scCols = (sc.data?.columns || []).filter((c: any) => c.isDefault !== true).map((c: any) => c.key);
            return a.productColumns.length > 0 && a.productColumns.some((pc: string) => scCols.includes(pc));
          });
          if (realMatch) resolvedId = realMatch.id;
        }
        return {
          user_id: newUser.user.id,
          brand_name: brandName,
          scorecard_id: resolvedId,
          product_columns: a.productColumns,
          assigned_by: admin.id,
        };
      });

      await supabaseAdmin.from('brand_user_assignments').insert(assignmentRows);
    }

    return NextResponse.json({
      id: newUser.user.id,
      email,
      contactName,
      brandName,
      tempPassword, // Shown once to admin
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create user' }, { status: 500 });
  }
}
