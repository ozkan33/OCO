import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

// Helper function to get user from Supabase token in cookies
async function getUserFromToken(request: Request) {
  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie') || '';
  const match = cookieHeader.match(/supabase-access-token=([^;]+)/);
  const token = match ? match[1] : null;

  if (!token) {
    throw new Error('No token found');
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      throw new Error('Invalid token');
    }
    return user;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// PUT /api/comments/[id] - Update a comment
export async function PUT(request: Request, { params }: { params: { id: string } }) {
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
      console.error('Error updating comment:', error);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    return NextResponse.json(comment);
  } catch (error) {
    console.error('Error in PUT /api/comments/[id]:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/comments/[id] - Delete a comment
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
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
      console.error('Error deleting comment:', error);
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error in DELETE /api/comments/[id]:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
} 