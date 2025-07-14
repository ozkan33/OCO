import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

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

// GET /api/scorecards - Get all scorecards for the current user
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    
    // Use the user ID from JWT token (which came from Supabase originally)
    const { data: scorecards, error } = await supabaseAdmin
      .from('user_scorecards')
      .select('*')
      .eq('user_id', user.id)
      .order('last_modified', { ascending: false });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(scorecards);
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/scorecards - Create a new scorecard
export async function POST(request: Request) {
  try {
    console.log('POST /api/scorecards - Starting request');
    const user = await getUserFromToken(request);
    console.log('User from token:', user);
    
    const body = await request.json();
    console.log('Request body:', body);
    
    const { title, vendor_id, data: scorecardData } = body;
    
    const insertData = {
      user_id: user.id,
      title: title || 'Untitled Scorecard',
      vendor_id: vendor_id || null,
      data: scorecardData || {},
      is_draft: true,
    };
    console.log('Insert data:', insertData);
    
    const { data: scorecard, error } = await supabaseAdmin
      .from('user_scorecards')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    console.log('Created scorecard:', scorecard);
    return NextResponse.json(scorecard, { status: 201 });
  } catch (error) {
    console.error('Catch error:', error);
    return NextResponse.json({ error: (error as Error).message || 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/scorecards - Update/upsert a scorecard (for auto-save)
export async function PUT(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const body = await request.json();
    
    const { id, title, vendor_id, data: scorecardData, is_draft } = body;
    
    const updateData = {
      user_id: user.id,
      title: title || 'Untitled Scorecard',
      vendor_id: vendor_id || null,
      data: scorecardData || {},
      is_draft: is_draft !== undefined ? is_draft : true,
      last_modified: new Date().toISOString(),
      version: 1, // Start with version 1, will be incremented by database
    };
    
    if (id) {
      // Update existing scorecard
      const { data: scorecard, error } = await supabaseAdmin
        .from('user_scorecards')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id) // Ensure user can only update their own scorecards
        .select()
        .single();
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json(scorecard);
    } else {
      // Create new scorecard
      const { data: scorecard, error } = await supabaseAdmin
        .from('user_scorecards')
        .insert(updateData)
        .select()
        .single();
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json(scorecard, { status: 201 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
} 