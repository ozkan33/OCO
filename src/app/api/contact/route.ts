import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { logger } from '../../../../lib/logger';
import { contactSubmissionSchema } from '../../../../lib/schemas';
import { z } from 'zod';

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
      return NextResponse.json(
        { error: 'Failed to send message. Please try again.' },
        { status: 500 }
      );
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
