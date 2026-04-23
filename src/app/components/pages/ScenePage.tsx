import React from 'react';
import { CrudPage } from '../CrudPage';

export function ScenePage() {
  return (
    <CrudPage
      title="场景管理"
      tableName="scene"
      searchField="scene_name"
      columns={[
        { key: 'scene_code', title: '场景编码', autoCode: 'SCN', hideInTable: true },
        { key: 'scene_name', title: '场景名称', required: true },
        { key: 'scene_location', title: '场景地点' },
        { key: 'description', title: '描述', type: 'textarea', hideInTable: true },
        { key: 'is_enabled', title: '是否启用', type: 'boolean' },
      ]}
    />
  );
}
