import { expect, test, describe } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseScheduleWorkbook } from './excel';

describe('schedule excel parser - Internal Format', () => {
  test('should successfully parse the internal schedule format (排班表.xlsx)', () => {
    // 模拟读取用户提供的测试文件
    const filePath = path.resolve(__dirname, '../../../../排班表.xlsx');
    
    // 如果文件不存在（例如 CI 环境中），则跳过该测试，但这能确认在本地可解析
    if (!fs.existsSync(filePath)) {
      console.warn('Skipping test,排班表.xlsx not found at', filePath);
      return;
    }

    const buffer = fs.readFileSync(filePath);
    
    // 假设导入月份是 2026-04（与文件内容匹配）
    const result = parseScheduleWorkbook(buffer, '2026-04-01');
    
    // 验证无错误
    expect(result.errors).toHaveLength(0);
    
    // 验证解析到了正确数量的数据行
    expect(result.rows.length).toBeGreaterThan(0);
    
    // 具体针对「排班表.xlsx」的特定数据进行断言（已知文件有36人）
    expect(result.rows).toHaveLength(36);
    
    // 断言第一个员工（文杰）
    const firstEmployee = result.rows[0];
    expect(firstEmployee.employeeName).toBe('文杰');
    expect(firstEmployee.assignments.length).toBeGreaterThan(0);
    
    // 断言 2026-04-01 排班是 A1
    const firstAssignment = firstEmployee.assignments.find(a => a.scheduleDate === '2026-04-01');
    expect(firstAssignment?.code).toBe('A1');

    // 断言 2026-04-02 排班是 休
    const secondAssignment = firstEmployee.assignments.find(a => a.scheduleDate === '2026-04-02');
    expect(secondAssignment?.code).toBe('休');
  });
});
