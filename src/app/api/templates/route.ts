import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

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

// GET /api/templates - Get all templates for the current user
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const { data: templates, error } = await supabaseAdmin
      .from('scorecard_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/templates - Create a new template
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const body = await request.json();
    const { name, columns, rows } = body;
    if (!name || !columns) {
      return NextResponse.json({ error: 'Missing name or columns' }, { status: 400 });
    }
    const insertData = {
      user_id: user.id,
      name,
      columns,
      rows: rows || null,
    };
    const { data: template, error } = await supabaseAdmin
      .from('scorecard_templates')
      .insert(insertData)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Internal server error' }, { status: 500 });
  }
} 