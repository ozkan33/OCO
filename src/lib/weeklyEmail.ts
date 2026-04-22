// "Your Week in Review" email — renders the stored weekly_summaries row as HTML
// and sends it from a NoReply address to the brand's client portal users.
//
// Callers:
//   - /api/admin/weekly-summary/send-email  (manual, from admin Clients page)
//   - /api/cron/weekly-summary              (automatic, after generation)
//
// The email is deliberately short: the full recap lives in the portal. Email
// body shows the opening paragraph + key stats + a big "Open your dashboard"
// button so clients who skim on mobile still get the signal.

import { Resend } from 'resend';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { logger } from '../../lib/logger';

// Resend requires the "from" domain to be verified. `volkan@3brothersmarketing.com`
// is currently the only verified mailbox, so we send from there but style the
// email as automated (AI banner + "do not reply" footer). Override via
// WEEKLY_EMAIL_FROM once a real noreply@ address is verified.
const NOREPLY_FROM = process.env.WEEKLY_EMAIL_FROM || '3 Brothers Marketing (automated) <volkan@3brothersmarketing.com>';
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://3brothersmarketing.com/portal';

export interface WeeklyEmailRecipient {
  email: string;
  name: string;
}

export interface SendWeeklyEmailResult {
  recipients: WeeklyEmailRecipient[];
  sentAt: string | null;
  skipped: boolean;
  reason?: string;
  error?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatWeekRange(weekOf: string): string {
  const start = new Date(`${weekOf}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// Bold inline (**foo**) → <strong>foo</strong>, with HTML-safe escaping.
function renderInline(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:600;color:#0f172a">$1</strong>');
}

// Convert the stored markdown (paragraphs, **headers**, "- " bullets) into
// table-based HTML that renders cleanly in Gmail / Outlook / Apple Mail.
function markdownToHtml(md: string): string {
  const paragraphs = md.split(/\n{2,}/);
  const out: string[] = [];
  for (const block of paragraphs) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const allBullets = lines.every((l) => l.startsWith('- ') || l.startsWith('* '));
    const isHeader = lines.length === 1 && /^\*\*.+\*\*$/.test(lines[0]);

    if (isHeader) {
      const text = lines[0].replace(/^\*\*|\*\*$/g, '');
      out.push(
        `<h4 style="margin:20px 0 8px;font-size:14px;font-weight:600;color:#0f172a;letter-spacing:.01em">${escapeHtml(text)}</h4>`,
      );
    } else if (allBullets) {
      const items = lines
        .map((l) => `<li style="margin:0 0 6px;padding:0;line-height:1.55">${renderInline(l.replace(/^[-*]\s+/, ''))}</li>`)
        .join('');
      out.push(
        `<ul style="margin:6px 0 12px;padding-left:20px;color:#334155;font-size:15px">${items}</ul>`,
      );
    } else {
      const joined = lines.map(renderInline).join(' ');
      out.push(`<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6">${joined}</p>`);
    }
  }
  return out.join('\n');
}

export function buildWeeklyEmailHtml(params: {
  brandName: string;
  contactName: string;
  weekOf: string;
  summaryMd: string;
  stats: { visitCount?: number; storeCount?: number; statusChangeCount?: number; scorecardNoteCount?: number };
  portalUrl: string;
}): { html: string; text: string; subject: string } {
  const { brandName, contactName, weekOf, summaryMd, stats, portalUrl } = params;
  const weekRange = formatWeekRange(weekOf);
  const visitCount = stats.visitCount || 0;
  const storeCount = stats.storeCount || 0;
  const statusChangeCount = stats.statusChangeCount || 0;

  const subject = `Your week in review · ${brandName} · ${weekRange}`;

  const bodyHtml = markdownToHtml(summaryMd);

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.06);border:1px solid #e2e8f0">

            <!-- AI banner -->
            <tr>
              <td style="background:linear-gradient(90deg,#ede9fe,#dbeafe);padding:10px 20px;border-bottom:1px solid #e2e8f0">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6d28d9">
                      ✦ AI generated summary
                    </td>
                    <td align="right" style="font-size:11px;color:#64748b">
                      Automated · please do not reply
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Header -->
            <tr>
              <td style="padding:24px 24px 8px">
                <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#2563eb">Your week in review</div>
                <h1 style="margin:4px 0 0;font-size:22px;font-weight:700;color:#0f172a">${escapeHtml(brandName)} — ${escapeHtml(weekRange)}</h1>
                <div style="margin-top:4px;font-size:13px;color:#64748b">Hi ${escapeHtml(contactName)}, here's what moved this week.</div>
              </td>
            </tr>

            <!-- Stats -->
            <tr>
              <td style="padding:12px 24px 4px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
                  <tr>
                    <td align="center" style="padding:14px 8px">
                      <div style="font-size:20px;font-weight:700;color:#0f172a;line-height:1">${visitCount}</div>
                      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-top:4px">${visitCount === 1 ? 'visit' : 'visits'}</div>
                    </td>
                    <td align="center" style="padding:14px 8px;border-left:1px solid #e2e8f0">
                      <div style="font-size:20px;font-weight:700;color:#0f172a;line-height:1">${storeCount}</div>
                      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-top:4px">${storeCount === 1 ? 'store' : 'stores'}</div>
                    </td>
                    <td align="center" style="padding:14px 8px;border-left:1px solid #e2e8f0">
                      <div style="font-size:20px;font-weight:700;color:#0f172a;line-height:1">${statusChangeCount}</div>
                      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-top:4px">status updates</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:16px 24px 4px">
                ${bodyHtml}
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:12px 24px 28px" align="center">
                <a href="${escapeHtml(portalUrl)}"
                   style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">
                  Open your partner dashboard →
                </a>
                <div style="margin-top:10px;font-size:12px;color:#64748b">Full recap, photos, and live statuses live in the portal.</div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px 22px;border-top:1px solid #e2e8f0;background:#f8fafc">
                <div style="font-size:11px;color:#94a3b8;line-height:1.5">
                  This is an automated weekly recap written by an AI assistant for 3 Brothers Marketing.
                  It summarizes real activity captured by your brokerage team.
                  Please do not reply to this email — for questions, reach your 3B contact directly.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text =
    `AI GENERATED · Your week in review — ${brandName} (${weekRange})\n\n` +
    `Hi ${contactName},\n\n` +
    `${stripMarkdown(summaryMd)}\n\n` +
    `Open your partner dashboard: ${portalUrl}\n\n` +
    `— Automated weekly recap from 3 Brothers Marketing. Please do not reply to this email.`;

  return { html, text, subject };
}

function stripMarkdown(md: string): string {
  return md
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
    .trim();
}

async function loadRecipients(brandName: string, targetEmail?: string): Promise<WeeklyEmailRecipient[]> {
  let query = supabaseAdmin
    .from('brand_user_profiles')
    .select('email, contact_name, is_active')
    .eq('brand_name', brandName)
    .eq('is_active', true);
  if (targetEmail) query = query.eq('email', targetEmail);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load recipients: ${error.message}`);
  return (data || [])
    .filter((r) => !!r.email)
    .map((r) => ({ email: r.email as string, name: (r.contact_name as string) || 'there' }));
}

interface StoredRecipient extends WeeklyEmailRecipient { sent_at: string }

// Merges newly-sent recipients into the previously-recorded list. Per-recipient
// send replaces the prior entry (so sent_at reflects the most recent send),
// while everyone else who was emailed before stays on the record. This matters
// for the per-user "Sent 4/19" indicator and for the cron's full-brand log.
function mergeRecipients(prev: StoredRecipient[], next: StoredRecipient[]): StoredRecipient[] {
  const byEmail = new Map<string, StoredRecipient>();
  for (const r of prev) byEmail.set(r.email.toLowerCase(), r);
  for (const r of next) byEmail.set(r.email.toLowerCase(), r);
  return Array.from(byEmail.values());
}

// Sends the weekly recap email to every active brand user for this brand —
// or to a single recipient if `opts.targetEmail` is set (per-row admin send).
// Persists send status onto weekly_summaries (email_sent_at, email_sent_to)
// using merge semantics so a single-user send doesn't wipe prior records.
// If Resend isn't configured, returns { skipped: true } and does not throw.
export async function sendWeeklySummaryEmail(
  brandName: string,
  weekOf: string,
  opts: { targetEmail?: string } = {},
): Promise<SendWeeklyEmailResult> {
  const targetEmail = opts.targetEmail;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn('[weekly-email] RESEND_API_KEY not set — skipping send');
    return { recipients: [], sentAt: null, skipped: true, reason: 'RESEND_API_KEY not set' };
  }

  const { data: summary, error: sumErr } = await supabaseAdmin
    .from('weekly_summaries')
    .select('brand_name, week_of, summary_md, stats, email_sent_to')
    .eq('brand_name', brandName)
    .eq('week_of', weekOf)
    .maybeSingle();
  if (sumErr) throw new Error(`Failed to load summary: ${sumErr.message}`);
  if (!summary) throw new Error(`No weekly summary found for ${brandName} week of ${weekOf}`);

  const recipients = await loadRecipients(brandName, targetEmail);
  if (recipients.length === 0) {
    return {
      recipients: [],
      sentAt: null,
      skipped: true,
      reason: targetEmail
        ? `No active brand user with email ${targetEmail} for this brand`
        : 'No active brand users for this brand',
    };
  }

  const resend = new Resend(apiKey);
  const sentRecipients: StoredRecipient[] = [];
  const failures: Array<{ email: string; error: string }> = [];

  for (const recipient of recipients) {
    const { html, text, subject } = buildWeeklyEmailHtml({
      brandName: summary.brand_name,
      contactName: recipient.name,
      weekOf: summary.week_of,
      summaryMd: summary.summary_md,
      stats: summary.stats || {},
      portalUrl: PORTAL_URL,
    });

    try {
      const { error: sendErr } = await resend.emails.send({
        from: NOREPLY_FROM,
        to: recipient.email,
        subject,
        html,
        text,
        headers: {
          'X-Auto-Response-Suppress': 'All',
          'Auto-Submitted': 'auto-generated',
        },
      });
      if (sendErr) {
        failures.push({ email: recipient.email, error: sendErr.message || String(sendErr) });
        logger.error(`[weekly-email] Resend send failed for ${recipient.email}:`, sendErr);
        continue;
      }
      sentRecipients.push({ ...recipient, sent_at: new Date().toISOString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ email: recipient.email, error: msg });
      logger.error(`[weekly-email] Resend threw for ${recipient.email}:`, err);
    }
  }

  const sentAt = sentRecipients.length > 0 ? new Date().toISOString() : null;
  const errorText = failures.length > 0 ? failures.map((f) => `${f.email}: ${f.error}`).join('; ') : null;

  // Merge with existing record so a per-user resend doesn't erase prior sends.
  const priorSent: StoredRecipient[] = Array.isArray(summary.email_sent_to)
    ? (summary.email_sent_to as StoredRecipient[]).filter(
        (r) => r && typeof r.email === 'string' && typeof r.sent_at === 'string',
      )
    : [];
  const mergedSent = mergeRecipients(priorSent, sentRecipients);
  // email_sent_at = most-recent send across all recipients on file. Stays null
  // only if nothing has ever been sent for this summary.
  const newestSentAt = mergedSent.reduce<string | null>((acc, r) => {
    if (!acc || r.sent_at > acc) return r.sent_at;
    return acc;
  }, null);

  const { error: updateErr } = await supabaseAdmin
    .from('weekly_summaries')
    .update({
      email_sent_at: newestSentAt,
      email_sent_to: mergedSent,
      email_error: errorText,
    })
    .eq('brand_name', brandName)
    .eq('week_of', weekOf);
  if (updateErr) logger.error('[weekly-email] Failed to persist send status:', updateErr);

  if (sentRecipients.length === 0 && failures.length > 0) {
    return {
      recipients: [],
      sentAt: null,
      skipped: false,
      error: errorText || 'All sends failed',
    };
  }

  logger.info(`[weekly-email] sent ${sentRecipients.length}/${recipients.length} for ${brandName} ${weekOf}`);
  return {
    recipients: sentRecipients,
    sentAt,
    skipped: false,
    error: errorText || undefined,
  };
}
