import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin and /vendor routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/vendor')) {
    // Get Supabase access token from cookie
    const accessToken = request.cookies.get('supabase-access-token')?.value;
    
    if (!accessToken) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    
    try {
      // Verify token with Supabase
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase configuration missing in middleware');
        return NextResponse.redirect(new URL('/auth/login', request.url));
      }
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      
      if (error || !user) {
        // Token is invalid, clear cookies and redirect
        const response = NextResponse.redirect(new URL('/auth/login', request.url));
        response.cookies.delete('supabase-access-token');
        response.cookies.delete('supabase-refresh-token');
        response.cookies.delete('supabase-user');
        return response;
      }
      
      // Token is valid, allow access
      return NextResponse.next();
    } catch (error) {
      console.error('Middleware auth error:', error);
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
  }
  
  // Allow all other routes
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/vendor/:path*'],
}; 