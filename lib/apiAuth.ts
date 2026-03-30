// Shared server-side auth helper for API routes.
// Replaces the copy-pasted getUserFromToken in every route file.

import { supabaseAdmin } from './supabaseAdmin';
import { logger } from './logger';

export async function getUserFromToken(request: Request) {
  const cookieHeader = request.headers.get('Cookie') ?? request.headers.get('cookie') ?? '';
  const token = cookieHeader.match(/supabase-access-token=([^;]+)/)?.[1] ?? null;

  if (!token) throw new Error('No token found');

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    logger.warn('Token verification failed:', error?.message);
    throw new Error('Invalid token');
  }

  return user;
}
