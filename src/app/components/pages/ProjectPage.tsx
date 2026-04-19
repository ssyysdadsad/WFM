import React from 'react';
import { CrudPage } from '../CrudPage';
import { listCrudRows, loadCrudForeignOptions, saveCrudRow } from '@/app/services/master-data.service';

export function ProjectPage() {
  return (
    <CrudPage
      title="项目管理"
      tableName="project"
      searchField="project_name"
      service={{
        list: (options) =>
          listCrudRows({
            tableName: 'project',
            searchField: options.searchField,
            search: options.search,
            defaultSort: options.defaultSort,
            extraFilters: options.extraFilters,
            selectQuery: options.selectQuery,
            page: options.page,
            pageSize: options.pageSize,
          }),
        save: (values, editingId) => saveCrudRow('project', values, editingId),
        loadForeignData: loadCrudForeignOptions,
      }}
      columns={[
        { key: 'project_code', title: '项目编码' },
        { key: 'project_name', title: '项目名称', required: true },
        { key: 'scene_id', title: '关联场景', required: true, foreignTable: 'scene', foreignLabel: 'scene_name' },
        { key: 'project_mode', title: '项目模式', type: 'select', required: true, options: [
          { label: '自建场景', value: 'self_built' },
          { label: '非侵入式', value: 'non_intrusive' },
        ]},
        { key: 'start_date', title: '开始日期', type: 'date', required: true },
        { key: 'end_date', title: '结束日期', type: 'date', required: true },
        { key: 'owner_employee_id', title: '负责人', foreignTable: 'employee', foreignLabel: 'full_name' },
        { key: 'project_status_dict_item_id', title: '状态', foreignTable: 'dict_item', foreignLabel: 'item_name' },
        { key: 'remark', title: '备注', type: 'textarea', hideInTable: true },
      ]}
    />
  );
}
