import React from 'react';
import { CrudPage } from '../CrudPage';

export function DepartmentPage() {
  return (
    <CrudPage
      title="部门管理"
      tableName="department"
      searchField="department_name"
      columns={[
        { key: 'department_code', title: '部门编码', autoCode: 'DEPT', hideInTable: true },
        { key: 'department_name', title: '部门名称', required: true },
        { key: 'manager_employee_id', title: '负责人', foreignTable: 'employee', foreignLabel: 'full_name' },
        { key: 'is_enabled', title: '是否启用', type: 'boolean' },
      ]}
    />
  );
}
