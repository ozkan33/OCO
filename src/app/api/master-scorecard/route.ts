import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

// Helper function to get user from token (same as comments route)
async function getUserFromToken(request: Request) {
  console.log('🔍 Starting getUserFromToken...');
  
  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie') || '';
  console.log('🍪 Cookie header:', cookieHeader ? 'Present' : 'Missing');
  
  const match = cookieHeader.match(/supabase-access-token=([^;]+)/);
  const token = match ? match[1] : null;
  console.log('🎫 Token extracted:', token ? 'Present' : 'Missing');

  if (!token) {
    console.error('❌ No token found in cookies');
    throw new Error('No token found');
  }

  try {
    console.log('🔐 Attempting to verify token with Supabase...');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error) {
      console.error('❌ Supabase auth error:', error);
      throw new Error('Invalid token');
    }
    
    if (!user) {
      console.error('❌ No user returned from Supabase');
      throw new Error('Invalid token');
    }
    
    console.log('✅ User authenticated successfully:', user.id);
    return user;
  } catch (error) {
    console.error('❌ Token verification failed:', error);
    throw new Error('Invalid token');
  }
}

// Helper function to detect retailer columns from scorecard data
function detectRetailerColumns(columns: any[]): string[] {
  // Default retailer columns based on the current schema
  const defaultRetailerColumns = [
    'name', 'priority', 'retail_price', 'category_review_date', 
    'buyer', 'store_count', 'route_to_market', 'hq_location', 
    'cmg', 'brand_lead'
  ];
  
  // Find columns that are NOT default columns (these are likely product/retailer status columns)
  const retailerColumns = columns
    .filter(col => !defaultRetailerColumns.includes(col.key) && col.key !== 'comments' && col.key !== '_delete_row')
    .map(col => col.key);
  
  return retailerColumns;
}

// Helper function to calculate penetration percentage
function calculatePenetration(rows: any[], retailerColumn: string): number {
  if (!rows || rows.length === 0) return 0;
  
  const authorizedCount = rows.filter(row => row[retailerColumn] === 'Authorized').length;
  return Math.round((authorizedCount / rows.length) * 100);
}

// GET /api/master-scorecard - Get aggregated retailer penetration data
export async function GET(request: Request) {
  console.log('📊 GET /api/master-scorecard called');
  try {
    const user = await getUserFromToken(request);
    console.log('✅ User authenticated for master scorecard:', user.id);

    // Fetch all scorecards for the user
    const { data: scorecards, error } = await supabaseAdmin
      .from('user_scorecards')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching scorecards:', error);
      return NextResponse.json({ error: 'Failed to fetch scorecards' }, { status: 500 });
    }

    if (!scorecards || scorecards.length === 0) {
      return NextResponse.json({
        retailers: [],
        items: [],
        data: {},
        lastUpdated: new Date().toISOString(),
      });
    }

    // --- NEW PIVOT AGGREGATION LOGIC ---
    const retailerSet = new Set();
    const itemSet = new Set();
    const data: Record<string, Record<string, { authorized: number; total: number }>> = {};

    for (const scorecard of scorecards) {
      const columns = scorecard.data?.columns || [];
      const rows = scorecard.data?.rows || [];
      // Find the retailer name column key
      const retailerCol = columns.find((col: any) => col.name === 'Retailer Name' || col.key === 'name');
      if (!retailerCol) continue;
      // User-added columns (items): not default, not retailer name
      const itemCols = columns.filter((col: any) => col.key !== retailerCol.key && !col.isDefault);
      for (const row of rows) {
        const retailer = String(row[retailerCol.key]);
        if (!retailer) continue;
        retailerSet.add(retailer);
        for (const itemCol of itemCols) {
          const item = itemCol.name;
          itemSet.add(item);
          const status = row[itemCol.key];
          if (!data[retailer]) data[retailer] = {};
          if (!data[retailer][item]) data[retailer][item] = { authorized: 0, total: 0 };
          if (status !== undefined && status !== null && status !== '') {
            data[retailer][item].total++;
            if (typeof status === 'string' && status.toLowerCase() === 'authorized') {
              data[retailer][item].authorized++;
            }
          }
        }
      }
    }
    // --- END PIVOT AGGREGATION LOGIC ---

    const result = {
      retailers: Array.from(retailerSet),
      items: Array.from(itemSet),
      data,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Error in GET /api/master-scorecard:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
} 