import { NextResponse } from 'next/server';

export async function POST() {
  // Create response
  const response = NextResponse.json({ success: true });
  
  // Clear all authentication cookies
  // Mobile-friendly cookie settings
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && typeof window !== 'undefined',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0, // Expire immediately
  };
  
  response.cookies.set('supabase-access-token', '', cookieOptions);
  response.cookies.set('supabase-refresh-token', '', cookieOptions);
  response.cookies.set('supabase-user', '', cookieOptions);
  
  return response;
} 