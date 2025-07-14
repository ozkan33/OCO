import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../../lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get user from Supabase session (cookie-based auth)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = user.id;

  const { id } = req.query;
  if (req.method === 'DELETE') {
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid template id' });
    }
    const { error } = await supabase
      .from('scorecard_templates')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 