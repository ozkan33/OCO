import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

const SYSTEM_COLUMNS = new Set([
  'name', 'priority', 'retail_price', 'category_review_date',
  'buyer', 'store_count', 'route_to_market', 'hq_location',
  'cmg', 'brand_lead', 'comments', '_delete_row',
]);

interface ProductDetail { name: string; status: string }
interface StoreDetail {
  name: string;
  location?: string;
  products: ProductDetail[];
  authorized: number;
  total: number;
  percentage: number;
}

function isAuthorized(status: unknown): boolean {
  return typeof status === 'string' && status.toLowerCase() === 'authorized';
}

function summarizeStores(parentRow: any, productCols: any[]) {
  const subRows: any[] = parentRow?.subgrid?.rows || [];
  const stores: StoreDetail[] = [];
  let storeAuthorized = 0;
  let storeTotal = 0;
  for (const sr of subRows) {
    const name = String(sr.store_name || sr.name || '').trim();
    if (!name) continue;
    const products: ProductDetail[] = [];
    // Per-store badge counts every displayed product (explicit + inherited);
    // aggregate cell counts only include explicit per-store values so the
    // chain-level badge doesn't inflate when stores simply inherit the parent.
    let displayAuth = 0;
    let displayTot = 0;
    let explicitAuth = 0;
    let explicitTot = 0;
    for (const pc of productCols) {
      const raw = sr[`product_${pc.key}`] ?? sr[pc.key];
      const hasExplicit = raw !== undefined && raw !== null && raw !== '';
      const status = hasExplicit ? raw : parentRow?.[pc.key];
      if (status === undefined || status === null || status === '') continue;
      products.push({ name: pc.name, status: String(status) });
      displayTot++;
      if (isAuthorized(status)) displayAuth++;
      if (hasExplicit) {
        explicitTot++;
        if (isAuthorized(status)) explicitAuth++;
      }
    }
    if (displayTot === 0) continue;
    const locParts = [sr.city, sr.state].filter(Boolean).map(String);
    stores.push({
      name,
      location: locParts.length ? locParts.join(', ') : undefined,
      products,
      authorized: displayAuth,
      total: displayTot,
      percentage: Math.round((displayAuth / displayTot) * 100),
    });
    storeAuthorized += explicitAuth;
    storeTotal += explicitTot;
  }
  return { stores, storeAuthorized, storeTotal };
}

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
    const pivotMap = new Map<string, Record<string, any>>();

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

        const products: ProductDetail[] = [];
        const activeProductCols: any[] = [];
        let productAuthorized = 0;
        let productTotal = 0;
        for (const pc of productCols) {
          const status = row[pc.key];
          if (status === undefined || status === null || status === '') continue;
          productTotal++;
          products.push({ name: pc.name, status: String(status) });
          activeProductCols.push(pc);
          if (isAuthorized(status)) productAuthorized++;
        }

        if (productTotal === 0) continue;

        const { stores, storeAuthorized, storeTotal } = summarizeStores(row, activeProductCols);
        const authorized = productAuthorized + storeAuthorized;
        const total = productTotal + storeTotal;

        if (!pivotMap.has(retailer)) pivotMap.set(retailer, {});
        pivotMap.get(retailer)![brandName] = {
          authorized,
          total,
          percentage: Math.round((authorized / total) * 100),
          products,
          stores,
          storeAuthorized,
          storeTotal,
        };
      }
    }

    const pivotRows = Array.from(pivotMap.entries()).map(([retailer, brands]) => ({
      retailer,
      brands,
    }));

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
