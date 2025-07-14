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

    console.log('📋 Found', scorecards?.length || 0, 'scorecards');

    if (!scorecards || scorecards.length === 0) {
      return NextResponse.json({
        customers: [],
        retailers: [],
        lastUpdated: new Date().toISOString()
      });
    }

    // Collect all unique retailer columns across all scorecards
    const allRetailerColumns = new Set<string>();
    const customerData: any[] = [];

    for (const scorecard of scorecards) {
      const data = scorecard.data || {};
      const columns = data.columns || [];
      const rows = data.rows || [];

      // Detect retailer columns for this scorecard
      const retailerColumns = detectRetailerColumns(columns);
      retailerColumns.forEach(col => allRetailerColumns.add(col));

      // Calculate penetration for each retailer column
      const penetrationData: Record<string, number> = {};
      let totalPenetration = 0;
      let retailerCount = 0;

      for (const retailerCol of retailerColumns) {
        const penetration = calculatePenetration(rows, retailerCol);
        penetrationData[retailerCol] = penetration;
        totalPenetration += penetration;
        retailerCount++;
      }

      // Calculate average penetration across all retailers for this customer
      const averagePenetration = retailerCount > 0 ? Math.round(totalPenetration / retailerCount) : 0;

      customerData.push({
        id: scorecard.id,
        name: scorecard.title,
        penetration: penetrationData,
        totalPenetration: averagePenetration,
        productCount: rows.length,
        lastModified: scorecard.last_modified
      });
    }

    // Calculate retailer averages
    const retailerAverages: Record<string, number> = {};
    const retailerArray = Array.from(allRetailerColumns);
    for (const retailer of retailerArray) {
      const customerPenetrations = customerData
        .map(customer => customer.penetration[retailer] || 0)
        .filter(p => p !== undefined);
      
      const average = customerPenetrations.length > 0 
        ? Math.round(customerPenetrations.reduce((sum, p) => sum + p, 0) / customerPenetrations.length)
        : 0;
      
      retailerAverages[retailer] = average;
    }

    // Calculate overall average
    const overallAverage = customerData.length > 0
      ? Math.round(customerData.reduce((sum, customer) => sum + customer.totalPenetration, 0) / customerData.length)
      : 0;

    const result = {
      customers: customerData,
      retailers: Array.from(allRetailerColumns),
      retailerAverages,
      overallAverage,
      lastUpdated: new Date().toISOString(),
      totalCustomers: customerData.length,
      totalRetailers: allRetailerColumns.size
    };

    console.log('✅ Master scorecard data calculated:', {
      customers: result.customers.length,
      retailers: result.retailers.length,
      overallAverage: result.overallAverage
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Error in GET /api/master-scorecard:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
} 