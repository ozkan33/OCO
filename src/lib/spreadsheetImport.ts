import ExcelJS from 'exceljs';

export class UnsupportedXlsError extends Error {
  constructor() {
    super('Legacy .xls files are not supported. Please save the file as .xlsx and try again.');
    this.name = 'UnsupportedXlsError';
  }
}

function cellToPrimitive(value: unknown): string | number | boolean | Date {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>).map(r => r.text ?? '').join('');
    }
    if ('result' in obj) {
      const r = obj.result;
      if (r == null) return '';
      if (typeof r === 'string' || typeof r === 'number' || typeof r === 'boolean') return r;
      if (r instanceof Date) return r;
      return String(r);
    }
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.hyperlink === 'string') return obj.hyperlink;
  }
  return String(value);
}

function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; continue; }
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const rows: unknown[][] = [];
  const colCount = worksheet.columnCount || 0;
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const rowArr: unknown[] = [];
    for (let c = 1; c <= colCount; c++) {
      rowArr.push(cellToPrimitive(row.getCell(c).value));
    }
    rows.push(rowArr);
  });
  return rows;
}

export async function parseSpreadsheetToRows(
  buffer: ArrayBuffer,
  filename: string,
): Promise<unknown[][]> {
  const ext = filename.toLowerCase().split('.').pop() || '';
  if (ext === 'xls') throw new UnsupportedXlsError();
  if (ext === 'csv') {
    const text = new TextDecoder('utf-8').decode(buffer);
    return parseCsv(text);
  }
  return parseXlsx(buffer);
}
