import React, { useMemo, useState } from 'react';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { CrudPage } from '../CrudPage';
import { listCrudRows, loadCrudForeignOptions, saveCrudRow } from '@/app/services/master-data.service';
import { supabase } from '../supabase';

export function ProjectPage() {
  const [filterMonth, setFilterMonth] = useState<dayjs.Dayjs | null>(null);

  // Build range filters for active projects in the selected month
  const rangeFilters = useMemo(() => {
    if (!filterMonth) return undefined;
    const monthStart = filterMonth.startOf('month').format('YYYY-MM-DD');
    const monthEnd = filterMonth.endOf('month').format('YYYY-MM-DD');
    return [
      { field: 'start_date', op: 'lte' as const, value: monthEnd },
      { field: 'end_date', op: 'gte' as const, value: monthStart },
    ];
  }, [filterMonth]);

  return (
    <CrudPage
      title="项目管理"
      tableName="project"
      searchField="project_name"
      renderExtraFilters={() => (
        <DatePicker
          picker="month"
          allowClear
          placeholder="按月份筛选"
          style={{ width: 150 }}
          value={filterMonth}
          onChange={(v) => setFilterMonth(v)}
        />
      )}
      service={{
        list: (options) =>
          listCrudRows({
            tableName: 'project',
            searchField: options.searchField,
            search: options.search,
            defaultSort: options.defaultSort,
            extraFilters: options.extraFilters,
            rangeFilters,
            selectQuery: options.selectQuery,
            page: options.page,
            pageSize: options.pageSize,
          }),
        save: (values, editingId) => saveCrudRow('project', values, editingId),
        delete: async (id: string) => {
          const { error } = await supabase.rpc('cascade_delete_project', { p_project_id: id });
          if (error) throw error;
        },
        loadForeignData: loadCrudForeignOptions,
      }}
      columns={[
        { key: 'project_code', title: '项目编码', autoCode: 'PRJ', hideInTable: true },
        { key: 'project_name', title: '项目名称', required: true },
        { key: 'scene_id', title: '关联场景', required: true, foreignTable: 'scene', foreignLabel: 'scene_name' },
        { key: 'project_mode', title: '项目模式', type: 'select', required: true, options: [
          { label: '自建场景', value: 'self_built' },
          { label: '非侵入式', value: 'non_intrusive' },
        ]},
        { key: 'start_date', title: '开始日期', type: 'date', required: true },
        { key: 'end_date', title: '结束日期', type: 'date', required: true },
        { key: 'owner_employee_id', title: '负责人', foreignTable: 'employee', foreignLabel: 'full_name' },
        { key: 'project_status_dict_item_id', title: '状态', foreignTable: 'dict_item', foreignLabel: 'item_name', dictType: 'project_status', filterable: true },
        { key: 'remark', title: '备注', type: 'textarea', hideInTable: true },
      ]}
    />
  );
}
