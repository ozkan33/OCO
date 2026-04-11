import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';
import { updateCommentSchema } from '../../../../../lib/schemas';
import { z } from 'zod';

// PUT /api/comments/[id] - Update a comment
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromToken(request);
    const { id } = await params;
    const body = await request.json();

    const { text } = updateCommentSchema.parse(body);

    // Single query: update only if user owns it, return result
    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .update({ text: text.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !comment) {
      return NextResponse.json({ error: 'Comment not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json(comment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }
    logger.error('Error in PUT /api/comments/[id]:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/comments/[id] - Delete a comment
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromToken(request);
    const { id } = await params;

    // Single query: delete only if user owns it
    const { data, error } = await supabaseAdmin
      .from('comments')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Comment not found or unauthorized' }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error('Error in DELETE /api/comments/[id]:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
