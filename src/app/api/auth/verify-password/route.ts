import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromToken } from '../../../../../lib/apiAuth';

// Simple in-memory rate limiter per user
const attempts = new Map<string, { count: number; lockedUntil: number }>();

// POST /api/auth/verify-password — verify the current user's password
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Rate limit: max 5 attempts, then lock for 60 seconds
    const now = Date.now();
    const record = attempts.get(user.id);
    if (record && now < record.lockedUntil) {
      const waitSec = Math.ceil((record.lockedUntil - now) / 1000);
      return NextResponse.json({ error: `Too many attempts. Try again in ${waitSec} seconds.` }, { status: 429 });
    }

    // Use a fresh throwaway client to avoid corrupting admin session
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { error } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password,
    });

    if (error) {
      // Track failed attempt with escalating lockout
      const current = attempts.get(user.id) || { count: 0, lockedUntil: 0 };
      current.count += 1;
      if (current.count >= 5) {
        // Escalate: 60s, 180s, 540s... up to 1 hour
        const multiplier = Math.floor(current.count / 5);
        const lockoutMs = Math.min(60_000 * Math.pow(3, multiplier - 1), 3600_000);
        current.lockedUntil = now + lockoutMs;
      }
      attempts.set(user.id, current);
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }

    // Success — clear attempts
    attempts.delete(user.id);
    return NextResponse.json({ verified: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
