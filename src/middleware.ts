import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin and /vendor routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/vendor')) {
    const token = request.cookies.get('token')?.value || '';
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    try {
      jwt.verify(token, JWT_SECRET);
      // If valid, allow
      return NextResponse.next();
    } catch {
      // Invalid token, redirect
      return NextResponse.redirect(new URL('/', request.url));
    }
  }
  // Allow all other routes
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/vendor/:path*'],
}; 