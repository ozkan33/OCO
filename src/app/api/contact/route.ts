import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logger } from '../../../../lib/logger';
import { contactSubmissionSchema } from '../../../../lib/schemas';
import { z } from 'zod';

const CONTACT_TO = process.env.CONTACT_TO_EMAIL || 'volkan@3brothersmarketing.com';
const CONTACT_FROM = process.env.CONTACT_FROM_EMAIL || 'onboarding@resend.dev';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// POST /api/contact - Public contact form submission
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = contactSubmissionSchema.parse(body);

    const { error } = await supabaseAdmin
      .from('contact_submissions')
      .insert({
        name: parsed.name,
        email: parsed.email,
        product: parsed.product,
        category: parsed.category,
        distribution: parsed.distribution,
        challenge: parsed.challenge,
        heard_about: parsed.heardAbout,
        message: parsed.message,
      });

    if (error) {
      logger.error('Failed to save contact submission:', error);
      const detail =
        process.env.NODE_ENV !== 'production'
          ? ` (${error.message})`
          : '';
      return NextResponse.json(
        { error: `Failed to send message. Please try again.${detail}` },
        { status: 500 }
      );
    }

    // Email notification via Resend — non-blocking: DB insert is source of truth.
    // If email fails we still return success so the user isn't told to resubmit.
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const resend = new Resend(apiKey);
        const rows: Array<[string, string]> = [
          ['Name', parsed.name],
          ['Email', parsed.email],
          ['Product / Brand', parsed.product],
          ['Category', parsed.category],
          ['Current Distribution', parsed.distribution || '—'],
          ['Biggest Challenge', parsed.challenge || '—'],
          ['How did you hear about us?', parsed.heardAbout || '—'],
          ['Anything else?', parsed.message || '—'],
        ];
        const html = `
          <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">
            <h2 style="margin:0 0 16px">New contact form submission</h2>
            <table style="border-collapse:collapse">
              ${rows.map(([k, v]) => `
                <tr>
                  <td style="padding:6px 12px 6px 0;color:#475569;vertical-align:top"><strong>${escapeHtml(k)}</strong></td>
                  <td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(v)}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        `;
        const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

        const { error: emailError } = await resend.emails.send({
          from: CONTACT_FROM,
          to: CONTACT_TO,
          replyTo: parsed.email,
          subject: `New inquiry from ${parsed.name} — ${parsed.product}`,
          html,
          text,
        });
        if (emailError) logger.error('Resend send failed:', emailError);
      } catch (e) {
        logger.error('Resend threw:', e);
      }
    } else {
      logger.warn('RESEND_API_KEY not set — skipping email notification');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || 'Invalid form data' },
        { status: 400 }
      );
    }

    logger.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
