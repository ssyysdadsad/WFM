import React from 'react';
import { CrudPage } from '../CrudPage';

export function SkillPage() {
  return (
    <CrudPage
      title="技能管理"
      tableName="skill"
      searchField="skill_name"
      columns={[
        { key: 'skill_code', title: '技能编码', autoCode: 'SKL', hideInTable: true },
        { key: 'skill_name', title: '技能名称', required: true },
        { key: 'description', title: '描述', type: 'textarea' },
        { key: 'is_enabled', title: '是否启用', type: 'boolean' },
      ]}
    />
  );
}
