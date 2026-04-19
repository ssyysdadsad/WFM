import { describe, expect, it } from 'vitest';
import { buildScheduleWorkbook, parseScheduleWorkbook } from '@/app/lib/schedule/excel';

describe('schedule excel helpers', () => {
  it('builds and parses workbook with expected headers and assignments', () => {
    const workbook = buildScheduleWorkbook({
      scheduleMonth: '2026-04-01',
      rows: [
        {
          employeeNo: 'E001',
          employeeName: '张三',
          departmentName: '客服部',
          codesByDate: {
            '2026-04-01': 'D1',
            '2026-04-02': 'OFF',
          },
        },
      ],
    });

    const parsed = parseScheduleWorkbook(workbook, '2026-04-01');

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].employeeNo).toBe('E001');
    expect(parsed.rows[0].assignments).toEqual([
      { scheduleDate: '2026-04-01', code: 'D1' },
      { scheduleDate: '2026-04-02', code: 'OFF' },
    ]);
  });
});
