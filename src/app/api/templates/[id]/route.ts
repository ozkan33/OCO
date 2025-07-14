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

// DELETE /api/templates/[id] - Delete a template by id
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromToken(request);
    const templateId = params.id;
    if (!templateId) {
      return NextResponse.json({ error: 'Missing template id' }, { status: 400 });
    }
    // Only allow deleting user's own template
    const { error } = await supabaseAdmin
      .from('scorecard_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Unauthorized' }, { status: 401 });
  }
} 