import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

const SYSTEM_COLUMNS = new Set([
  'name', 'priority', 'retail_price', 'category_review_date',
  'buyer', 'store_count', 'route_to_market', 'hq_location',
  'cmg', 'brand_lead', 'comments', '_delete_row',
]);

// GET /api/portal/master-scorecard — Brand user's filtered master scorecard
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = user.user_metadata?.role;
    if (role !== 'BRAND' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get brand user assignments (which scorecards + which product columns)
    const { data: assignments } = await supabaseAdmin
      .from('brand_user_assignments')
      .select('*')
      .eq('user_id', user.id);

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({
        brands: [],
        pivotRows: [],
        lastUpdated: new Date().toISOString(),
      });
    }

    // Fetch assigned scorecards
    const scorecardIds = assignments.map((a: any) => a.scorecard_id);
    const { data: scorecards } = await supabaseAdmin
      .from('user_scorecards')
      .select('*')
      .in('id', scorecardIds);

    if (!scorecards || scorecards.length === 0) {
      return NextResponse.json({
        brands: [],
        pivotRows: [],
        lastUpdated: new Date().toISOString(),
      });
    }

    // Build pivot: brands as columns, retailers as rows
    const brandNames: string[] = [];
    const pivotMap = new Map<string, Record<string, { authorized: number; total: number; products: { name: string; status: string }[] }>>();

    for (const sc of scorecards) {
      const assignment = assignments.find((a: any) => a.scorecard_id === sc.id);
      const allowedProductCols = assignment?.product_columns || [];
      const columns = sc.data?.columns || [];
      const rows = sc.data?.rows || [];
      const brandName = sc.title || 'Untitled';

      // Filter to only the product columns this client is allowed to see
      const productCols = columns.filter((col: any) =>
        !SYSTEM_COLUMNS.has(col.key) &&
        !col.isDefault &&
        (allowedProductCols.includes(col.key) || allowedProductCols.includes(col.name))
      );

      if (productCols.length === 0) continue;
      brandNames.push(brandName);

      const retailerCol = columns.find(
        (col: any) => col.name === 'Customer' || col.name === 'Customer Name' || col.name === 'Retailer Name' || col.key === 'name'
      );
      if (!retailerCol) continue;

      for (const row of rows) {
        const retailer = String(row[retailerCol.key] || '').trim();
        if (!retailer) continue;

        let authorized = 0;
        let total = 0;
        const products: { name: string; status: string }[] = [];
        for (const pc of productCols) {
          const status = row[pc.key];
          if (status !== undefined && status !== null && status !== '') {
            total++;
            products.push({ name: pc.name, status: String(status) });
            if (typeof status === 'string' && status.toLowerCase() === 'authorized') {
              authorized++;
            }
          }
        }

        if (total === 0) continue;

        if (!pivotMap.has(retailer)) pivotMap.set(retailer, {});
        pivotMap.get(retailer)![brandName] = { authorized, total, products };
      }
    }

    const pivotRows = Array.from(pivotMap.entries()).map(([retailer, brands]) => {
      const brandCells: Record<string, any> = {};
      for (const [brand, { authorized, total, products }] of Object.entries(brands)) {
        brandCells[brand] = {
          authorized,
          total,
          percentage: Math.round((authorized / total) * 100),
          products,
        };
      }
      return { retailer, brands: brandCells };
    });

    pivotRows.sort((a, b) => a.retailer.localeCompare(b.retailer));

    return NextResponse.json({
      brands: brandNames,
      pivotRows,
      lastUpdated: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
