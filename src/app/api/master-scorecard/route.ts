import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { logger } from '../../../../lib/logger';

// Default system columns that are NOT product columns
const SYSTEM_COLUMNS = new Set([
  'name', 'priority', 'retail_price', 'category_review_date',
  'buyer', 'store_count', 'route_to_market', 'hq_location',
  'cmg', 'brand_lead', 'comments', '_delete_row',
]);

interface ProductDetail {
  name: string;
  status: string;
  // True when the status was pulled from the chain row because the store sub-row
  // had no explicit entry. UI should visually distinguish these from verified ones.
  inherited?: boolean;
}

interface StoreDetail {
  name: string;
  location?: string;
  products: ProductDetail[];
  // authorized/total/percentage reflect EXPLICIT per-store statuses only.
  // When no explicit statuses exist, total is 0 and percentage is null so the
  // UI can render "—" instead of a misleading 0% or 100%.
  authorized: number;
  total: number;
  percentage: number | null;
}

interface BrandCell {
  authorized: number;
  total: number;
  percentage: number;
  products: ProductDetail[];
  stores: StoreDetail[];
  storeAuthorized: number;
  storeTotal: number;
}

interface PivotRow {
  retailer: string;
  brands: Record<string, BrandCell>;
}

function isAuthorized(status: unknown): boolean {
  return typeof status === 'string' && status.toLowerCase() === 'authorized';
}

function summarizeStores(
  parentRow: any,
  productCols: any[],
): { stores: StoreDetail[]; storeAuthorized: number; storeTotal: number } {
  const subRows: any[] = parentRow?.subgrid?.rows || [];
  const stores: StoreDetail[] = [];
  let storeAuthorized = 0;
  let storeTotal = 0;

  for (const sr of subRows) {
    const name = String(sr.store_name || sr.name || '').trim();
    if (!name) continue;
    const products: ProductDetail[] = [];
    // Inherited statuses keep the store's product list visually complete, but
    // never contribute to the per-store percentage — otherwise a store with
    // zero real data would inherit every "Authorized" chain status and falsely
    // display 100%. Only explicit per-store entries count toward the pill.
    let explicitAuth = 0;
    let explicitTot = 0;
    let anyDisplayed = false;
    for (const pc of productCols) {
      const raw = sr[`product_${pc.key}`] ?? sr[pc.key];
      const hasExplicit = raw !== undefined && raw !== null && raw !== '';
      const status = hasExplicit ? raw : parentRow?.[pc.key];
      if (status === undefined || status === null || status === '') continue;
      products.push({ name: pc.name, status: String(status), inherited: !hasExplicit });
      anyDisplayed = true;
      if (hasExplicit) {
        explicitTot++;
        if (isAuthorized(status)) explicitAuth++;
      }
    }
    if (!anyDisplayed) continue;
    const locParts = [sr.city, sr.state].filter(Boolean).map(String);
    stores.push({
      name,
      location: locParts.length ? locParts.join(', ') : undefined,
      products,
      authorized: explicitAuth,
      total: explicitTot,
      percentage: explicitTot > 0 ? Math.round((explicitAuth / explicitTot) * 100) : null,
    });
    storeAuthorized += explicitAuth;
    storeTotal += explicitTot;
  }

  return { stores, storeAuthorized, storeTotal };
}

// GET /api/master-scorecard - Pivot view: brands as columns, retailers as rows
export async function GET(request: Request) {
  logger.debug('📊 GET /api/master-scorecard called');
  try {
    const user = await getUserFromToken(request);

    const { searchParams } = new URL(request.url);
    const selectedScorecardId = searchParams.get('scorecardId');

    // Fetch all scorecards for the user
    const { data: scorecards, error } = await supabaseAdmin
      .from('user_scorecards')
      .select('*')
      .eq('user_id', user.id)
      .order('title', { ascending: true });

    if (error) {
      logger.error('❌ Error fetching scorecards:', error);
      return NextResponse.json({ error: 'Failed to fetch scorecards' }, { status: 500 });
    }

    if (!scorecards || scorecards.length === 0) {
      return NextResponse.json({
        brands: [],
        pivotRows: [],
        lastUpdated: new Date().toISOString(),
      });
    }

    // ── Legacy single-scorecard view (when scorecardId is provided) ──
    if (selectedScorecardId) {
      return handleLegacyView(scorecards, selectedScorecardId);
    }

    // ── Pivot view: all brands × all retailers ──
    const brandNames: string[] = [];
    const pivotMap = new Map<string, Record<string, BrandCell>>();

    for (const sc of scorecards) {
      const columns = sc.data?.columns || [];
      const rows = sc.data?.rows || [];
      const brandName = sc.title || 'Untitled';

      // Find product columns (non-system, non-default)
      const productCols = columns.filter(
        (col: any) => !SYSTEM_COLUMNS.has(col.key) && !col.isDefault
      );

      if (productCols.length === 0) continue;
      brandNames.push(brandName);

      // Find the retailer name column
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

        // Combined cell counts: subgrid stores expand the denominator when present.
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

    // Build pivot rows sorted by retailer name
    const pivotRows: PivotRow[] = [];
    for (const [retailer, brands] of pivotMap) {
      pivotRows.push({ retailer, brands });
    }

    // Default sort: by retailer name
    pivotRows.sort((a, b) => a.retailer.localeCompare(b.retailer));

    return NextResponse.json({
      brands: brandNames,
      pivotRows,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('❌ Error in GET /api/master-scorecard:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// Legacy single-scorecard view for backward compatibility
function handleLegacyView(scorecards: any[], scorecardId: string) {
  const sc = scorecards.find(s => s.id === scorecardId) || scorecards[0];
  if (!sc) {
    return NextResponse.json({
      selectedScorecard: null,
      retailers: [],
      retailerSummary: [],
      lastUpdated: new Date().toISOString(),
    });
  }

  const columns = sc.data?.columns || [];
  const rows = sc.data?.rows || [];

  const retailerCol = columns.find(
    (col: any) => col.name === 'Customer' || col.name === 'Customer Name' || col.name === 'Retailer Name' || col.key === 'name'
  );
  if (!retailerCol) {
    return NextResponse.json({
      selectedScorecard: { id: sc.id, title: sc.title },
      retailers: [],
      retailerSummary: [],
      lastUpdated: new Date().toISOString(),
    });
  }

  const productCols = columns.filter(
    (col: any) => !SYSTEM_COLUMNS.has(col.key) && !col.isDefault
  );

  if (productCols.length === 0) {
    return NextResponse.json({
      selectedScorecard: { id: sc.id, title: sc.title },
      retailers: [],
      retailerSummary: [],
      lastUpdated: new Date().toISOString(),
      hasProducts: false,
      message: `No product columns found in "${sc.title}".`,
    });
  }

  const retailerSummary: any[] = [];
  for (const row of rows) {
    const retailer = String(row[retailerCol.key] || '').trim();
    if (!retailer) continue;

    let productAuthorized = 0;
    let productTotal = 0;
    const products: ProductDetail[] = [];
    const activeProductCols: any[] = [];

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

    retailerSummary.push({
      retailer,
      authorized,
      total,
      percentage: Math.round((authorized / total) * 100),
      products,
      stores,
      storeAuthorized,
      storeTotal,
    });
  }

  retailerSummary.sort((a, b) => b.percentage - a.percentage);

  return NextResponse.json({
    selectedScorecard: { id: sc.id, title: sc.title },
    retailers: retailerSummary.map((r: any) => r.retailer),
    retailerSummary,
    lastUpdated: new Date().toISOString(),
  });
}
