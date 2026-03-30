import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';

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