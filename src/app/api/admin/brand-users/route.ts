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

    // Latest weekly summary per brand — used in the Clients table to show when
    // the AI report was last generated and whether it was cron-driven or a
    // manual admin regen. The summary itself is brand-scoped (shared across
    // a brand's users), but `email_sent_to` is a per-recipient log, so we
    // also fan out a per-user `last_email_sent_at` for the email indicator.
    const brandNames = Array.from(new Set((profiles || []).map((p: any) => p.brand_name).filter(Boolean)));
    const latestByBrand = new Map<string, { week_of: string; generated_at: string; generated_by: 'cron' | 'manual'; email_sent_to: Array<{ email: string; sent_at: string }> }>();
    if (brandNames.length > 0) {
      const { data: summaries } = await supabaseAdmin
        .from('weekly_summaries')
        .select('brand_name, week_of, generated_at, generated_by, email_sent_to')
        .in('brand_name', brandNames)
        .order('generated_at', { ascending: false });
      for (const s of summaries || []) {
        if (!latestByBrand.has(s.brand_name)) {
          const sentList = Array.isArray(s.email_sent_to)
            ? (s.email_sent_to as Array<{ email?: string; sent_at?: string }>)
                .filter((r) => r && typeof r.email === 'string' && typeof r.sent_at === 'string')
                .map((r) => ({ email: (r.email as string).toLowerCase(), sent_at: r.sent_at as string }))
            : [];
          latestByBrand.set(s.brand_name, {
            week_of: s.week_of,
            generated_at: s.generated_at,
            generated_by: s.generated_by || 'cron',
            email_sent_to: sentList,
          });
        }
      }
    }

    const result = (profiles || []).map((p: any) => {
      const latest = latestByBrand.get(p.brand_name) || null;
      const userEmail = typeof p.email === 'string' ? p.email.toLowerCase() : '';
      const sentEntry = latest && userEmail
        ? latest.email_sent_to.find((r) => r.email === userEmail)
        : undefined;
      return {
        ...p,
        assignments: (assignments || []).filter((a: any) => a.user_id === p.id),
        latest_summary: latest
          ? {
              week_of: latest.week_of,
              generated_at: latest.generated_at,
              generated_by: latest.generated_by,
            }
          : null,
        last_email_sent_at: sentEntry ? sentEntry.sent_at : null,
      };
    });

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
        // Flag the new user for mandatory 2FA enrollment. Cleared when verify succeeds.
        // Middleware uses this to force them through /auth/change-password (which owns
        // the enrollment UI) even after password change commits. Without this, a failed
        // 2FA setup call leaves totp_enabled=false + must_change_password=false and the
        // 2FA gate in middleware has nothing to latch onto → user lands on /portal
        // unprotected. See supabase/migrations/20240101000027_brand_users_must_enroll_2fa.sql.
        must_enroll_2fa: features.ENABLE_2FA,
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
        must_enroll_2fa: features.ENABLE_2FA,
        created_by: admin.id,
      });

    if (profileError) {
      // Rollback: delete the auth user we just created. If this fails we
      // leave an orphaned auth row — surface that so the admin knows to
      // retry or contact support rather than silently 500'ing.
      const { error: rollbackErr } = await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      const msg = rollbackErr
        ? `Failed to create profile; rollback of auth user also failed (${rollbackErr.message}). Email may remain registered.`
        : 'Failed to create profile';
      return NextResponse.json({ error: msg }, { status: 500 });
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
