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

    // Get the selected scorecard ID from query parameters
    const { searchParams } = new URL(request.url);
    const selectedScorecardId = searchParams.get('scorecardId');
    console.log('🎯 Selected scorecard ID:', selectedScorecardId);

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
        selectedScorecard: null,
        retailers: [],
        retailerSummary: [],
        lastUpdated: new Date().toISOString(),
      });
    }

    // Find the selected scorecard
    const selectedScorecard = selectedScorecardId 
      ? scorecards.find(sc => sc.id === selectedScorecardId) 
      : scorecards[0]; // Default to first scorecard if none selected

    if (!selectedScorecard) {
      return NextResponse.json({
        selectedScorecard: null,
        retailers: [],
        retailerSummary: [],
        lastUpdated: new Date().toISOString(),
      });
    }

    console.log('📊 Processing scorecard:', selectedScorecard.title);

    // Process the selected scorecard data
    const columns = selectedScorecard.data?.columns || [];
    const rows = selectedScorecard.data?.rows || [];

    // Find the retailer name column
    const retailerCol = columns.find((col: { name?: string; key: string }) => col.name === 'Retailer Name' || col.key === 'name');
    if (!retailerCol) {
      return NextResponse.json({
        selectedScorecard: { id: selectedScorecard.id, title: selectedScorecard.title },
        retailers: [],
        retailerSummary: [],
        lastUpdated: new Date().toISOString(),
      });
    }

    // Find product columns (user-added columns that are not default)
    const productCols = columns.filter((col: { key: string; isDefault?: boolean; name?: string }) => 
      col.key !== retailerCol.key && 
      !col.isDefault && 
      col.key !== 'comments' && 
      col.key !== '_delete_row'
    );

    console.log('📦 Found product columns:', productCols.map((col: { name?: string }) => col.name));

    // If no product columns found, return early with helpful message
    if (productCols.length === 0) {
      return NextResponse.json({
        selectedScorecard: { 
          id: selectedScorecard.id,
          title: selectedScorecard.title
        },
        retailers: [],
        retailerSummary: [],
        lastUpdated: new Date().toISOString(),
        hasProducts: false,
        message: `No product columns found in "${selectedScorecard.title}". Add product columns to see retailer authorization data.`
      });
    }

    // Calculate retailer authorization percentages
    const retailerSummary: Array<{
      retailer: string;
      authorized: number;
      total: number;
      percentage: number;
      products: Array<{ name: string; status: string }>;
    }> = [];

    for (const row of rows) {
      const retailer = String(row[retailerCol.key]);
      if (!retailer || retailer.trim() === '') continue;

      let authorizedCount = 0;
      let totalCount = 0;
      const products: Array<{ name: string; status: string }> = [];

      for (const productCol of productCols) {
        const status = row[productCol.key];
        if (status !== undefined && status !== null && status !== '') {
          totalCount++;
          products.push({ name: productCol.name, status: String(status) });
          
          if (typeof status === 'string' && status.toLowerCase() === 'authorized') {
            authorizedCount++;
          }
        }
      }

      if (totalCount > 0) {
        retailerSummary.push({
          retailer,
          authorized: authorizedCount,
          total: totalCount,
          percentage: Math.round((authorizedCount / totalCount) * 100),
          products
        });
      }
    }

    // Sort retailers by percentage (highest first)
    retailerSummary.sort((a, b) => b.percentage - a.percentage);

    const result = {
      selectedScorecard: {
        id: selectedScorecard.id,
        title: selectedScorecard.title
      },
      retailers: retailerSummary.map(r => r.retailer),
      retailerSummary,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Error in GET /api/master-scorecard:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
} 