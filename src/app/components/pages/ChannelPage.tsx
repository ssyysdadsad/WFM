import React from 'react';
import { CrudPage } from '../CrudPage';

export function ChannelPage() {
  return (
    <CrudPage
      title="渠道管理"
      tableName="channel"
      searchField="channel_name"
      columns={[
        { key: 'channel_code', title: '渠道编码', autoCode: 'CH', hideInTable: true },
        { key: 'channel_name', title: '渠道名称', required: true },
        { key: 'channel_type_dict_item_id', title: '渠道类型', foreignTable: 'dict_item', foreignLabel: 'item_name', dictType: 'channel_type' },
        { key: 'contact_person', title: '联系人' },
        { key: 'contact_phone', title: '联系方式' },
        { key: 'cooperation_description', title: '合作说明', type: 'textarea', hideInTable: true },
        { key: 'is_enabled', title: '是否启用', type: 'boolean' },
      ]}
    />
  );
}
