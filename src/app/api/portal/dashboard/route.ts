import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../../lib/apiAuth';

// GET /api/portal/dashboard - Get brand user's filtered scorecard data
export async function GET(request: Request) {
  try {
    const user = await getUserFromToken(request);
    const role = user.user_metadata?.role;

    if (role !== 'BRAND' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get brand profile
    const { data: profile } = await supabaseAdmin
      .from('brand_user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile && role === 'BRAND') {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get assignments
    const { data: assignments } = await supabaseAdmin
      .from('brand_user_assignments')
      .select('*')
      .eq('user_id', user.id);

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({
        brand: profile?.brand_name || '',
        contactName: profile?.contact_name || '',
        scorecards: [],
        summary: { totalRetailers: 0, authorized: 0, inProcess: 0, buyerPassed: 0, presented: 0, other: 0 },
        marketVisits: [],
      });
    }

    // Fetch assigned scorecards by ID
    const scorecardIds = assignments.map((a: any) => a.scorecard_id);
    let { data: scorecards } = await supabaseAdmin
      .from('user_scorecards')
      .select('*')
      .in('id', scorecardIds);

    // If some assignments didn't match by ID (stale IDs from localStorage),
    // fetch ALL scorecards for the admin who created this user and match by title
    const foundIds = new Set((scorecards || []).map((sc: any) => sc.id));
    const missingAssignments = assignments.filter((a: any) => !foundIds.has(a.scorecard_id));
    if (missingAssignments.length > 0 && profile?.created_by) {
      const { data: adminScorecards } = await supabaseAdmin
        .from('user_scorecards')
        .select('*')
        .eq('user_id', profile.created_by);
      if (adminScorecards) {
        // Try to match by product columns — if a scorecard has the same product columns, it's likely the right one
        for (const missed of missingAssignments) {
          const wantedCols = missed.product_columns || [];
          const match = adminScorecards.find((sc: any) => {
            const scCols = (sc.data?.columns || []).filter((c: any) => c.isDefault !== true).map((c: any) => c.key);
            return wantedCols.some((wc: string) => scCols.includes(wc));
          });
          if (match && !foundIds.has(match.id)) {
            scorecards = [...(scorecards || []), match];
            foundIds.add(match.id);
            // Update the assignment to use the correct DB ID (self-healing)
            await supabaseAdmin
              .from('brand_user_assignments')
              .update({ scorecard_id: match.id })
              .eq('id', missed.id);
          }
        }
      }
    }

    // Fetch comments for all assigned scorecards
    const { data: allComments } = await supabaseAdmin
      .from('comments')
      .select('id, scorecard_id, row_id, text, user_id, user_email, created_at')
      .in('scorecard_id', scorecardIds)
      .order('created_at', { ascending: false });

    // Build filtered view for each scorecard
    const statusCounts = { authorized: 0, inProcess: 0, buyerPassed: 0, presented: 0, other: 0 };
    const defaultColumnKeys = ['name', 'priority', 'retail_price', 'buyer', 'store_count', 'hq_location', 'cmg', 'category_review_date', 'route_to_market'];

    const filteredScorecards = (scorecards || []).map((sc: any) => {
      const assignment = assignments.find((a: any) => a.scorecard_id === sc.id);
      const allowedProductCols = assignment?.product_columns || [];
      const columns = sc.data?.columns || [];
      const rows = sc.data?.rows || [];

      // Filter columns: keep default columns + assigned product columns only
      const visibleColumns = columns.filter((col: any) =>
        defaultColumnKeys.includes(col.key) || col.key === 'comments' || col.key === '_delete_row'
          ? false // exclude internal columns
          : col.isDefault === true || allowedProductCols.includes(col.key) || allowedProductCols.includes(col.name)
      );

      // Keep default info columns for display
      const infoColumns = columns.filter((col: any) => col.isDefault === true && col.key !== 'comments' && col.key !== '_delete_row');

      // Build row data with only visible product columns
      const productCols = visibleColumns.filter((c: any) => c.isDefault !== true);
      const filteredRows = rows.map((row: any) => {
        const products = productCols.map((col: any) => {
          const status = row[col.key] || '';
          // Count statuses
          if (status === 'Authorized') statusCounts.authorized++;
          else if (status === 'In Process') statusCounts.inProcess++;
          else if (status === 'Buyer Passed') statusCounts.buyerPassed++;
          else if (status === 'Presented') statusCounts.presented++;
          else if (status) statusCounts.other++;
          return { name: col.name, status };
        });

        // Get comments for this row
        const rowComments = (allComments || [])
          .filter((c: any) => c.scorecard_id === sc.id && String(c.row_id) === String(row.id))
          .map((c: any) => {
            const emailName = (c.user_email || 'Admin').split('@')[0];
            const author = emailName.charAt(0).toUpperCase() + emailName.slice(1);
            return { id: c.id, text: c.text, author, date: c.created_at, isOwn: c.user_id === user.id };
          });

        return {
          rowId: String(row.id),
          retailerName: row.name || '',
          products,
          retailerInfo: {
            priority: row.priority || '',
            buyer: row.buyer || '',
            storeCount: row.store_count || 0,
            hqLocation: row.hq_location || '',
            contact: row.cmg || '',
          },
          comments: rowComments,
          notes: row.notes || '',
        };
      });

      return {
        id: sc.id,
        scorecardName: sc.title,
        retailers: filteredRows.sort((a: any, b: any) => (a.retailerName || '').localeCompare(b.retailerName || '')),
      };
    });

    // Update last_login
    await supabaseAdmin
      .from('brand_user_profiles')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    return NextResponse.json({
      brand: profile?.brand_name || user.user_metadata?.brand || '',
      contactName: profile?.contact_name || user.user_metadata?.name || '',
      scorecards: filteredScorecards.sort((a: any, b: any) => (a.scorecardName || '').localeCompare(b.scorecardName || '')),
      summary: {
        totalRetailers: filteredScorecards.reduce((sum: number, sc: any) => sum + sc.retailers.length, 0),
        ...statusCounts,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
