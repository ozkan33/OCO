import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { logger } from '../../../../lib/logger';
import { createCommentSchema } from '../../../../lib/schemas';
import { z } from 'zod';

// Helper: verify or migrate a scorecard, returns { id, title }
async function resolveScorecard(
  scorecardId: string,
  userId: string,
  scorecardData?: { name?: string; columns?: any[]; rows?: any[] } | null,
) {
  if (scorecardId.startsWith('scorecard_')) {
    if (!scorecardData) throw new Error('Scorecard data required for migration');

    const { data, error } = await supabaseAdmin
      .from('user_scorecards')
      .insert({
        user_id: userId,
        title: scorecardData.name || 'Migrated Scorecard',
        data: { columns: scorecardData.columns || [], rows: scorecardData.rows || [] },
        is_draft: true,
      })
      .select('id, title')
      .single();

    if (error) throw error;
    return data;
  }

  // Database scorecard — only select id for ownership verification
  const { data, error } = await supabaseAdmin
    .from('user_scorecards')
    .select('id, title')
    .eq('id', scorecardId)
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error('Scorecard not found or access denied');
  return data;
}

// GET /api/comments
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const { searchParams } = new URL(request.url);
    const scorecardId = searchParams.get('scorecard_id');

    if (!scorecardId) {
      return NextResponse.json({ error: 'Scorecard ID is required' }, { status: 400 });
    }

    // Local scorecards can't have database comments
    if (scorecardId.startsWith('scorecard_')) {
      return NextResponse.json([]);
    }

    // Verify ownership
    const { error: scErr } = await supabaseAdmin
      .from('user_scorecards')
      .select('id')
      .eq('id', scorecardId)
      .eq('user_id', user.id)
      .single();

    if (scErr) {
      return NextResponse.json({ error: 'Scorecard not found or access denied' }, { status: 404 });
    }

    const { data: comments, error } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('scorecard_id', scorecardId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Database error fetching comments:', error);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    return NextResponse.json(comments);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/comments
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const body = await request.json();

    // Validate input
    const parsed = createCommentSchema.parse(body);
    const { scorecard_id, user_id: row_id, text, scorecard_data } = parsed;

    // Resolve scorecard (verify ownership or migrate) — single query
    let scorecard;
    try {
      scorecard = await resolveScorecard(scorecard_id, user.id, scorecard_data);
    } catch {
      return NextResponse.json({ error: 'Scorecard not found or access denied' }, { status: 404 });
    }

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert({
        scorecard_id: scorecard.id,
        user_id: user.id,
        row_id: row_id,
        text: text.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error('Database error creating comment:', error);
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    const response = {
      ...comment,
      row_id,
      migrated_scorecard: scorecard_id.startsWith('scorecard_')
        ? { old_id: scorecard_id, new_id: scorecard.id, title: scorecard.title }
        : null,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
