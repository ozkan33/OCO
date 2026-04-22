import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

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

// Row-level structural keys that are NOT column values. These must be preserved
// when we scrub orphan cells (see scrubOrphanCells below).
const RESERVED_ROW_KEYS = new Set(['id', 'isAddRow', 'isSubRow', 'parentId', 'subgrid']);

// Defense in depth: strip row properties whose key is not a declared column key.
// Scorecard cells live inside `data.rows[i][columnKey]` (no normalized cells
// table is used on this path), with the column key derived from the column's
// name. If a column is deleted but the orphan row[key] values survive, adding
// a new column with the same name would "adopt" those orphans on the client
// — making deleted data reappear. Scrubbing here kills that class of bug
// regardless of client behavior.
function scrubOrphanCells(scorecardData: any): any {
  if (!scorecardData || typeof scorecardData !== 'object') return scorecardData;
  const columns = Array.isArray(scorecardData.columns) ? scorecardData.columns : null;
  const rows = Array.isArray(scorecardData.rows) ? scorecardData.rows : null;
  if (!columns || !rows) return scorecardData;

  const validKeys = new Set<string>();
  for (const col of columns) {
    if (col && typeof col.key === 'string') validKeys.add(col.key);
  }

  const scrubbedRows = rows.map((row: any) => {
    if (!row || typeof row !== 'object') return row;
    const out: Record<string, any> = {};
    for (const key of Object.keys(row)) {
      if (RESERVED_ROW_KEYS.has(key) || validKeys.has(key)) {
        out[key] = row[key];
      }
    }
    return out;
  });

  return { ...scorecardData, rows: scrubbedRows };
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
      data: scorecardData ? scrubOrphanCells(scorecardData) : {},
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