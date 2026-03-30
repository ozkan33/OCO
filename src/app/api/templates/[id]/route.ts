import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

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