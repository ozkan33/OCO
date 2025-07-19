import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { access_token, refresh_token, user } = await request.json();
    
    if (!access_token || !refresh_token || !user) {
      return NextResponse.json({ error: 'Missing session data' }, { status: 400 });
    }
    
    // Create response
    const response = NextResponse.json({ success: true });
    
    // Set HTTP-only cookies for secure authentication
    // Mobile-friendly cookie settings
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && typeof window !== 'undefined',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    };
    
    // Set session cookies
    response.cookies.set('supabase-access-token', access_token, cookieOptions);
    response.cookies.set('supabase-refresh-token', refresh_token, cookieOptions);
    response.cookies.set('supabase-user', JSON.stringify(user), cookieOptions);
    
    return response;
  } catch (error) {
    console.error('Set session error:', error);
    return NextResponse.json({ error: 'Failed to set session' }, { status: 500 });
  }
} 