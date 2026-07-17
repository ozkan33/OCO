import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';

// Per-brand "Your Week in Review" email opt-out. A brand with no row here is
// enabled by default; a row with weekly_email_enabled = false blocks both the
// Monday cron auto-send and the manual per-contact send (enforced in
// sendWeeklySummaryEmail).

// GET /api/admin/brand-email-prefs
//   → { prefs: { [brand_name]: boolean } }  (only brands with an explicit row)
export async function GET(request: Request) {
  try {
    const admin = await getUserFromToken(request);
    if (admin.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('brand_email_prefs')
      .select('brand_name, weekly_email_enabled');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const prefs: Record<string, boolean> = {};
    for (const row of data || []) {
      if (row.brand_name) prefs[row.brand_name] = row.weekly_email_enabled !== false;
    }
    return NextResponse.json({ prefs });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// PATCH /api/admin/brand-email-prefs
//   Body: { brand_name: string, enabled: boolean }
//   Upserts the brand's weekly-email flag.
export async function PATCH(request: Request) {
  try {
    const admin = await getUserFromToken(request);
    if (admin.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const brandName: unknown = body?.brand_name;
    const enabled: unknown = body?.enabled;
    if (typeof brandName !== 'string' || brandName.trim().length === 0) {
      return NextResponse.json({ error: 'brand_name is required' }, { status: 400 });
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('brand_email_prefs')
      .upsert(
        {
          brand_name: brandName.trim(),
          weekly_email_enabled: enabled,
          updated_at: new Date().toISOString(),
          updated_by: admin.id,
        },
        { onConflict: 'brand_name' },
      );
    if (error) {
      logger.error('[brand-email-prefs] upsert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ brand_name: brandName.trim(), enabled });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg.includes('Unauthorized') || msg.includes('token') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
