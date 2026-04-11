/**
 * Import recovered scorecard Excel files into Supabase.
 *
 * Usage: node scripts/import-recovered-data.js
 *
 * Reads all .xlsx files from C:/Users/kahve/Downloads/3BS-Data/
 * and creates new scorecards in the database.
 */

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.IMPORT_USER_ID;
const DATA_DIR = process.env.IMPORT_DATA_DIR || './data';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !USER_ID) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IMPORT_USER_ID');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Default columns that every scorecard has
const DEFAULT_COLUMN_NAMES = [
  'Retailer Name', 'Priority', 'Retail Price', 'CategoryReviewDate',
  'Buyer', 'Store Count', 'Route To Market', 'HQ Location', '3B Contact'
];

// Metadata columns from export that should be stripped
const META_COLUMNS = [
  'Parent Indicator', 'Type', 'Has Children', 'Children Count',
  'Child Number', 'Parent Name'
];

// Map Excel header names to column keys
function headerToKey(header) {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// Known default column key mappings
const KNOWN_KEY_MAP = {
  'retailer_name': 'name',
  'priority': 'priority',
  'retail_price': 'retail_price',
  'categoryreviewdate': 'category_review_date',
  'buyer': 'buyer',
  'store_count': 'store_count',
  'route_to_market': 'route_to_market',
  'hq_location': 'hq_location',
  '3b_contact': 'cmg',
  'store_contact': 'store_contact',
  'note': 'notes',
  'new_column': 'new_column',
};

function getColumnKey(header) {
  const raw = headerToKey(header);
  return KNOWN_KEY_MAP[raw] || raw;
}

function isDefaultColumn(header) {
  return DEFAULT_COLUMN_NAMES.includes(header);
}

function buildColumns(headers) {
  const dataHeaders = headers.filter(h => !META_COLUMNS.includes(h));
  return dataHeaders.map(h => ({
    key: getColumnKey(h),
    name: h,
    editable: true,
    sortable: true,
    isDefault: isDefaultColumn(h),
  }));
}

function parseExcelFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rawRows.length < 2) return null;

  const headers = rawRows[0];
  const columns = buildColumns(headers);
  const dataHeaderIndices = {};
  headers.forEach((h, i) => {
    if (!META_COLUMNS.includes(h)) {
      dataHeaderIndices[i] = getColumnKey(h);
    }
  });

  // Find indices of metadata columns
  const typeIdx = headers.indexOf('Type');
  const parentNameIdx = headers.indexOf('Parent Name');

  // Parse rows, tracking parent/child relationships
  const parentRows = [];
  const childrenByParentName = {};

  for (let r = 1; r < rawRows.length; r++) {
    const raw = rawRows[r];
    const rowType = typeIdx >= 0 ? raw[typeIdx] : 'Parent';

    const rowData = { id: Date.now() + r * 100 + Math.floor(Math.random() * 100) };
    for (const [idxStr, key] of Object.entries(dataHeaderIndices)) {
      const idx = parseInt(idxStr);
      let val = raw[idx];
      if (val === undefined || val === null) val = '';
      // store_count as number
      if (key === 'store_count') {
        rowData[key] = typeof val === 'number' ? val : (parseInt(val) || 0);
      } else {
        rowData[key] = typeof val === 'number' ? String(val) : (val || '');
      }
    }

    if (rowType === 'Child') {
      const parentName = parentNameIdx >= 0 ? raw[parentNameIdx] : null;
      if (parentName) {
        if (!childrenByParentName[parentName]) childrenByParentName[parentName] = [];
        rowData.isSubRow = true;
        childrenByParentName[parentName].push(rowData);
      }
    } else {
      parentRows.push(rowData);
    }
  }

  // Attach children to parents as subgrids
  for (const parent of parentRows) {
    const parentName = parent.name || '';
    if (childrenByParentName[parentName] && childrenByParentName[parentName].length > 0) {
      const children = childrenByParentName[parentName];
      children.forEach(child => { child.parentId = parent.id; });
      parent.subgrid = {
        columns: columns.map(c => ({ ...c })),
        rows: children,
      };
    }
  }

  // Determine scorecard name from product columns
  const productCols = columns
    .filter(c => !c.isDefault && !['notes', 'new_column', 'store_contact'].includes(c.key))
    .map(c => c.name);

  let scorecardName;
  if (productCols.length > 0) {
    if (productCols.length <= 3) {
      scorecardName = 'Recovered - ' + productCols.join(', ');
    } else {
      scorecardName = 'Recovered - ' + productCols.slice(0, 2).join(', ') + ` (+${productCols.length - 2} more)`;
    }
  } else {
    scorecardName = 'Recovered - ' + parentRows.length + ' retailers';
  }

  return {
    name: scorecardName,
    columns,
    rows: parentRows,
    rowCount: parentRows.length,
    fileName: path.basename(filePath),
  };
}

async function importScorecard(parsed) {
  const data = {
    columns: parsed.columns,
    rows: parsed.rows,
  };

  const { data: scorecard, error } = await supabase
    .from('user_scorecards')
    .insert({
      user_id: USER_ID,
      title: parsed.name,
      data: data,
      is_draft: false,
      last_modified: new Date().toISOString(),
      version: 1,
    })
    .select('id, title')
    .single();

  if (error) {
    console.error(`  ERROR importing "${parsed.name}":`, error.message);
    return null;
  }

  return scorecard;
}

async function main() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.xlsx')).sort();
  console.log(`Found ${files.length} Excel files in ${DATA_DIR}\n`);

  const results = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    console.log(`Parsing: ${file}`);

    const parsed = parseExcelFile(filePath);
    if (!parsed) {
      console.log('  Skipped (no data)\n');
      continue;
    }

    const productCols = parsed.columns
      .filter(c => !c.isDefault && !['notes', 'new_column', 'store_contact'].includes(c.key))
      .map(c => c.name);

    console.log(`  Name: ${parsed.name}`);
    console.log(`  Rows: ${parsed.rowCount}`);
    console.log(`  Product columns: ${productCols.length > 0 ? productCols.join(', ') : '(none - default only)'}`);

    const scorecard = await importScorecard(parsed);
    if (scorecard) {
      console.log(`  Imported as: ${scorecard.id}`);
      results.push({ file, ...scorecard });
    }
    console.log('');
  }

  console.log('=== Import Summary ===');
  console.log(`Successfully imported: ${results.length}/${files.length}`);
  results.forEach(r => {
    console.log(`  ${r.title} (${r.id}) <- ${r.file}`);
  });
}

main().catch(console.error);
