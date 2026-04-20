import { NextResponse } from 'next/server';
import { getUserFromToken } from '../../../../../../lib/apiAuth';
import { sendWeeklySummaryEmail } from '@/lib/weeklyEmail';
import { mondayOf } from '@/lib/weeklySummary';
import { logger } from '../../../../../../lib/logger';

// POST /api/admin/weekly-summary/send-email
// Body: { brand_name: string, week_of?: "YYYY-MM-DD" }
// Sends the already-generated weekly summary to all active brand users for
// this brand. Does NOT regenerate — admin regenerates separately if needed.
export async function POST(request: Request) {
  try {
    const admin = await getUserFromToken(request);
    if (admin.user_metadata?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const brandName: string | undefined = body?.brand_name;
    const weekParam: string | undefined = body?.week_of;
    const recipientEmailRaw: string | undefined = body?.recipient_email;
    const recipientEmail = typeof recipientEmailRaw === 'string' && recipientEmailRaw.trim().length > 0
      ? recipientEmailRaw.trim().toLowerCase()
      : undefined;

    if (!brandName || typeof brandName !== 'string') {
      return NextResponse.json({ error: 'brand_name is required' }, { status: 400 });
    }

    let weekOf: string;
    if (weekParam) {
      const parsed = new Date(`${weekParam}T00:00:00Z`);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid week_of' }, { status: 400 });
      }
      weekOf = mondayOf(parsed).toISOString().slice(0, 10);
    } else {
      const mon = mondayOf(new Date());
      mon.setUTCDate(mon.getUTCDate() - 7);
      weekOf = mon.toISOString().slice(0, 10);
    }

    const result = await sendWeeklySummaryEmail(brandName, weekOf, { targetEmail: recipientEmail });

    if (result.skipped) {
      return NextResponse.json(
        {
          brand: brandName,
          week_of: weekOf,
          sent: 0,
          skipped: true,
          reason: result.reason,
        },
        { status: 200 },
      );
    }

    if (result.recipients.length === 0 && result.error) {
      return NextResponse.json(
        { error: result.error, brand: brandName, week_of: weekOf },
        { status: 502 },
      );
    }

    return NextResponse.json({
      brand: brandName,
      week_of: weekOf,
      sent: result.recipients.length,
      sent_at: result.sentAt,
      recipients: result.recipients,
      partial_error: result.error,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[admin send weekly email] failed:', msg);
    const status = msg.includes('Unauthorized') || msg.includes('token') ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
