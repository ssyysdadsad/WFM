import React from 'react';
import { CrudPage } from '../CrudPage';

export function LaborRulePage() {
  return (
    <CrudPage
      title="用工规则"
      tableName="labor_rule"
      searchField="rule_name"
      columns={[
        { key: 'rule_name', title: '规则名称', required: true },
        { key: 'daily_hours_limit', title: '日工时上限', type: 'number' },
        { key: 'weekly_hours_limit', title: '周工时上限', type: 'number' },
        { key: 'max_consecutive_work_days', title: '连续工作天数上限', type: 'number' },
        { key: 'is_hard_constraint', title: '硬约束', type: 'boolean' },
        { key: 'applicable_scope', title: '适用范围', hideInTable: true, type: 'textarea' },
        { key: 'remark', title: '备注', type: 'textarea', hideInTable: true },
      ]}
    />
  );
}
