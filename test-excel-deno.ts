import * as XLSX from 'npm:xlsx@0.18.5';
import fs from 'node:fs';

function findTitleRowIndex(rows: any[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const text = (rows[i] ?? []).map((c: any) => String(c ?? '').trim()).filter(Boolean).join('');
    if (text.includes('排班') || text.includes('项目')) return i;
  }
  return -1;
}

const buffer = fs.readFileSync('/Users/cm-jszn/Desktop/WFM/排班表.xlsx');
const workbook = XLSX.read(buffer, { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
  header: 1,
  raw: true,
  defval: '',
});
console.log('rows length', rows.length);
console.log('detectNewFormat:', detectNewFormat(rows));
function detectNewFormat(rows: any[][]): boolean {
  if (rows.length < 3) return false;
  const titleIdx = findTitleRowIndex(rows);
  if (titleIdx === -1) return false;
  const dateRow = rows[titleIdx + 1] ?? [];
  return dateRow.some((cell: any) => {
    const v = Number(cell);
    if (!Number.isFinite(v)) return false;
    if (v > 366) return XLSX.SSF.parse_date_code(v) != null;
    return Number.isInteger(v) && v >= 1 && v <= 31;
  });
}
