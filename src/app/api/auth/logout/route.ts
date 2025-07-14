import { NextResponse } from 'next/server';

export async function POST() {
  // Clear the token cookie
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Set-Cookie': 'token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax',
    },
  });
} 