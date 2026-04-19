import React from 'react';
import { CrudPage } from '../CrudPage';
import { listCrudRows, loadCrudForeignOptions, saveCrudRow } from '@/app/services/master-data.service';

export function TaskPage() {
  return (
    <CrudPage
      title="任务管理"
      tableName="task"
      searchField="task_name"
      service={{
        list: (options) =>
          listCrudRows({
            tableName: 'task',
            searchField: options.searchField,
            search: options.search,
            defaultSort: options.defaultSort,
            extraFilters: options.extraFilters,
            selectQuery: options.selectQuery,
            page: options.page,
            pageSize: options.pageSize,
          }),
        save: (values, editingId) => saveCrudRow('task', values, editingId),
        loadForeignData: loadCrudForeignOptions,
      }}
      columns={[
        { key: 'task_code', title: '任务编码' },
        { key: 'task_name', title: '任务名称', required: true },
        { key: 'project_id', title: '所属项目', required: true, foreignTable: 'project', foreignLabel: 'project_name' },
        { key: 'target_total_hours', title: '目标工时', type: 'number' },
        { key: 'hours_per_shift', title: '单次工时', type: 'number' },
        { key: 'target_efficiency_rate', title: '效率要求', type: 'number', hideInTable: true },
        { key: 'planned_start_date', title: '开始日期', type: 'date' },
        { key: 'planned_end_date', title: '结束日期', type: 'date' },
        { key: 'task_status_dict_item_id', title: '状态', foreignTable: 'dict_item', foreignLabel: 'item_name' },
        { key: 'remark', title: '备注', type: 'textarea', hideInTable: true },
      ]}
    />
  );
}
