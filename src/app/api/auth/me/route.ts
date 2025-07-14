import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export async function GET(request: Request) {
  try {
    // Get the access token from cookies
    const cookieHeader = request.headers.get('Cookie');
    const accessTokenMatch = cookieHeader?.match(/supabase-access-token=([^;]+)/);
    const accessToken = accessTokenMatch ? accessTokenMatch[1] : null;
    
    if (!accessToken) {
      return NextResponse.json({ error: 'No authentication token found' }, { status: 401 });
    }
    
    // Verify the token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (error || !user) {
      console.error('Supabase auth error:', error);
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }
    
    // Return user data with role
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email,
        role: 'ADMIN', // You can store this in user metadata or a separate table
      }
    });
    
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
} 