import React from 'react';
import { CrudPage } from '../CrudPage';
import { listCrudRows, loadCrudForeignOptions, saveCrudRow } from '@/app/services/master-data.service';

export function DevicePage() {
  return (
    <CrudPage
      title="设备管理"
      tableName="device"
      searchField="device_name"
      service={{
        list: (options) =>
          listCrudRows({
            tableName: 'device',
            searchField: options.searchField,
            search: options.search,
            defaultSort: options.defaultSort,
            extraFilters: options.extraFilters,
            selectQuery: options.selectQuery,
            page: options.page,
            pageSize: options.pageSize,
          }),
        save: (values, editingId) => saveCrudRow('device', values, editingId),
        loadForeignData: loadCrudForeignOptions,
      }}
      columns={[
        { key: 'device_code', title: '设备编号', autoCode: 'DEV', hideInTable: true },
        { key: 'device_name', title: '设备名称', required: true },
        { key: 'scene_id', title: '所属场景', required: true, foreignTable: 'scene', foreignLabel: 'scene_name' },
        { key: 'skill_id', title: '绑定技能', required: true, foreignTable: 'skill', foreignLabel: 'skill_name' },
        { key: 'device_status_dict_item_id', title: '状态', foreignTable: 'dict_item', foreignLabel: 'item_name', dictType: 'device_status' },
        { key: 'remark', title: '备注', type: 'textarea', hideInTable: true },
      ]}
    />
  );
}
