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
}

interface BrandCell {
  authorized: number;
  total: number;
  percentage: number;
  products: ProductDetail[];
}

interface PivotRow {
  retailer: string;
  brands: Record<string, BrandCell>;
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
    // retailer -> { brand -> { authorized, total, products } }
    const pivotMap = new Map<string, Record<string, { authorized: number; total: number; products: ProductDetail[] }>>();

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
        (col: any) => col.name === 'Retailer Name' || col.key === 'name'
      );
      if (!retailerCol) continue;

      for (const row of rows) {
        const retailer = String(row[retailerCol.key] || '').trim();
        if (!retailer) continue;

        let authorized = 0;
        let total = 0;
        const products: ProductDetail[] = [];
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

        if (!pivotMap.has(retailer)) {
          pivotMap.set(retailer, {});
        }
        pivotMap.get(retailer)![brandName] = { authorized, total, products };
      }
    }

    // Build pivot rows sorted by retailer name
    const pivotRows: PivotRow[] = [];
    for (const [retailer, brands] of pivotMap) {
      const brandCells: Record<string, BrandCell> = {};
      for (const [brand, { authorized, total, products }] of Object.entries(brands)) {
        brandCells[brand] = {
          authorized,
          total,
          percentage: Math.round((authorized / total) * 100),
          products,
        };
      }
      pivotRows.push({ retailer, brands: brandCells });
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
    (col: any) => col.name === 'Retailer Name' || col.key === 'name'
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

    let authorizedCount = 0;
    let totalCount = 0;
    const products: any[] = [];

    for (const pc of productCols) {
      const status = row[pc.key];
      if (status !== undefined && status !== null && status !== '') {
        totalCount++;
        products.push({ name: pc.name, status: String(status) });
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
        products,
      });
    }
  }

  retailerSummary.sort((a, b) => b.percentage - a.percentage);

  return NextResponse.json({
    selectedScorecard: { id: sc.id, title: sc.title },
    retailers: retailerSummary.map((r: any) => r.retailer),
    retailerSummary,
    lastUpdated: new Date().toISOString(),
  });
}
