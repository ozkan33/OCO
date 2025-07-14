import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

// Helper function to get user from Supabase token in cookies
async function getUserFromToken(request: Request) {
  // Read the cookie header
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

// GET /api/scorecards/[id] - Get a specific scorecard
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromToken(request);
    const { id } = await params;
    
    const { data: scorecard, error } = await supabaseAdmin
      .from('user_scorecards')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(scorecard);
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// PUT /api/scorecards/[id] - Update a specific scorecard
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromToken(request);
    const body = await request.json();
    const { id } = await params;
    
    const { title, vendor_id, data: scorecardData, is_draft } = body;
    
    const updateData = {
      title: title || 'Untitled Scorecard',
      vendor_id: vendor_id || null,
      data: scorecardData || {},
      is_draft: is_draft !== undefined ? is_draft : true,
      last_modified: new Date().toISOString(),
    };
    
    const { data: scorecard, error } = await supabaseAdmin
      .from('user_scorecards')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id) // Ensure user can only update their own scorecards
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(scorecard);
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// DELETE /api/scorecards/[id] - Delete a specific scorecard
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromToken(request);
    const { id } = await params;
    
    const { error } = await supabaseAdmin
      .from('user_scorecards')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id); // Ensure user can only delete their own scorecards
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ message: 'Scorecard deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
} 