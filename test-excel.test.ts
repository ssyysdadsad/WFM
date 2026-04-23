import { expect, test } from 'vitest';
import * as fs from 'fs';
import { parseScheduleWorkbook } from './src/app/lib/schedule/excel';

test('parse excel check', () => {
  const buffer = fs.readFileSync('/Users/cm-jszn/Desktop/WFM/排班表.xlsx');
  const result = parseScheduleWorkbook(buffer, '2026-04');
  console.log('Result total parsed rows:', result.rows.length);
  if (result.rows.length > 0) {
    console.log('First matched row:', JSON.stringify(result.rows[0]));
  }
  console.log('Errors length:', result.errors.length);
});
