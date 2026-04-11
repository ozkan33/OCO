import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';
import { logger } from '../../../../../lib/logger';

// PUT /api/comments/[id] - Update a comment
export async function PUT(request: Request, context: unknown) {
  const { params } = context as { params: { id: string } };

  try {
    const user = await getUserFromToken(request);
    const { id } = params;
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // First, verify the comment exists and belongs to the user
    const { data: existingComment, error: fetchError } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existingComment) {
      return NextResponse.json({ error: 'Comment not found or unauthorized' }, { status: 404 });
    }

    // Update the comment
    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .update({
        text: text.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating comment:', error);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    return NextResponse.json(comment);
  } catch (error) {
    logger.error('Error in PUT /api/comments/[id]:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/comments/[id] - Delete a comment
export async function DELETE(
  request: Request,
  context: { params: { id: string } }
) {
  const { params } = context;
  // ... rest of your logic


  try {
    const user = await getUserFromToken(request);
    const { id } = params;

    // First, verify the comment exists and belongs to the user
    const { data: existingComment, error: fetchError } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existingComment) {
      return NextResponse.json({ error: 'Comment not found or unauthorized' }, { status: 404 });
    }

    // Delete the comment
    const { error } = await supabaseAdmin
      .from('comments')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting comment:', error);
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error('Error in DELETE /api/comments/[id]:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
} 