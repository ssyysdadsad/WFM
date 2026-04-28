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
        { key: 'manager_user_id', title: '负责人', foreignTable: 'user_account', foreignLabel: 'username' },
        { key: 'is_enabled', title: '是否启用', type: 'boolean' },
      ]}
    />
  );
}
