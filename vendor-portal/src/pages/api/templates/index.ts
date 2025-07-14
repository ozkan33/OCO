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

  if (req.method === 'GET') {
    // List all templates for the user
    const { data, error } = await supabase
      .from('scorecard_templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { name, columns, rows } = req.body;
    if (!name || !columns) {
      return res.status(400).json({ error: 'Missing name or columns' });
    }
    const { data, error } = await supabase
      .from('scorecard_templates')
      .insert([{ user_id: userId, name, columns, rows }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 