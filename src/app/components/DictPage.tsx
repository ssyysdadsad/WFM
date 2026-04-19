import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Space, Typography, message, Tag, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { parseDictExtraConfig } from '@/app/lib/validators/dict';
import { invalidateDictCache, useDict } from '@/app/hooks/useDict';
import { listDictTypes, saveDictItem, saveDictType } from '@/app/services/dict.service';
import type { DictItem, DictType } from '@/app/types/dict';

export function DictPage() {
  const [types, setTypes] = useState<DictType[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<DictType | null>(null);
  const [typeModal, setTypeModal] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [editingType, setEditingType] = useState<DictType | null>(null);
  const [editingItem, setEditingItem] = useState<DictItem | null>(null);
  const [typeForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const { items, refresh: refreshItems } = useDict(selectedType?.typeCode);

  useEffect(() => {
    loadTypes();
  }, []);

  useEffect(() => {
    if (!selectedType && types.length > 0) {
      setSelectedType(types[0]);
    }
  }, [selectedType, types]);

  const selectedTypeLabel = useMemo(
    () => (selectedType ? `${selectedType.typeName} (${selectedType.typeCode})` : ''),
    [selectedType],
  );

  async function loadTypes() {
    setLoading(true);
    try {
      const nextTypes = await listDictTypes();
      setTypes(nextTypes);
      if (selectedType) {
        const nextSelectedType = nextTypes.find((item) => item.id === selectedType.id) ?? null;
        setSelectedType(nextSelectedType ?? nextTypes[0] ?? null);
      }
    } catch (error) {
      message.error(getErrorMessage(error, '加载字典类型失败'));
    } finally {
      setLoading(false);
    }
  }

  async function saveType() {
    try {
      const values = await typeForm.validateFields();
      await saveDictType(
        {
          typeCode: values.type_code,
          typeName: values.type_name,
          description: values.description,
          sortOrder: values.sort_order,
          isEnabled: values.is_enabled,
        },
        editingType?.id,
      );
      message.success('保存成功');
      setTypeModal(false);
      typeForm.resetFields();
      setEditingType(null);
      await loadTypes();
    } catch (error) {
      message.error(getErrorMessage(error, '保存字典类型失败'));
    }
  }

  async function saveItem() {
    try {
      if (!selectedType) {
        message.warning('请先选择字典类型');
        return;
      }

      const values = await itemForm.validateFields();
      await saveDictItem(
        selectedType.id,
        {
          itemCode: values.item_code,
          itemName: values.item_name,
          description: values.description,
          extraConfig: parseDictExtraConfig(values.extra_config),
          sortOrder: values.sort_order,
          isEnabled: values.is_enabled,
        },
        editingItem?.id,
      );

      invalidateDictCache(selectedType.typeCode);
      message.success('保存成功');
      setItemModal(false);
      itemForm.resetFields();
      setEditingItem(null);
      await refreshItems();
    } catch (error) {
      message.error(getErrorMessage(error, '保存字典项失败'));
    }
  }

  return (
    <div>
      <Typography.Title level={4}>字典管理</Typography.Title>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 320, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Typography.Text strong>字典类型</Typography.Text>
            <Space size={8}>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => loadTypes()}>刷新</Button>
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setEditingType(null); typeForm.resetFields(); setTypeModal(true); }}>新增</Button>
            </Space>
          </div>
          <Table
            rowKey="id" size="small" loading={loading} dataSource={types} pagination={false}
            onRow={(record) => ({ onClick: () => setSelectedType(record), style: { cursor: 'pointer', background: selectedType?.id === record.id ? '#e6f4ff' : undefined } })}
            columns={[
              { title: '编码', dataIndex: 'typeCode', width: 120 },
              { title: '名称', dataIndex: 'typeName', width: 100 },
              { title: '状态', dataIndex: 'isEnabled', width: 60, render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag> },
              {
                title: '',
                key: 'action',
                width: 50,
                render: (_: unknown, record: DictType) => (
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingType(record);
                      typeForm.setFieldsValue({
                        type_code: record.typeCode,
                        type_name: record.typeName,
                        description: record.description,
                        sort_order: record.sortOrder,
                        is_enabled: record.isEnabled,
                      });
                      setTypeModal(true);
                    }}
                  />
                ),
              },
            ]}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Typography.Text strong>字典项 {selectedType ? `- ${selectedTypeLabel}` : ''}</Typography.Text>
            <Button size="small" type="primary" icon={<PlusOutlined />} disabled={!selectedType} onClick={() => { setEditingItem(null); itemForm.resetFields(); setItemModal(true); }}>新增</Button>
          </div>
          <Table
            rowKey="id" size="small" dataSource={items} pagination={false}
            columns={[
              { title: '编码', dataIndex: 'itemCode', width: 100 },
              { title: '名称', dataIndex: 'itemName', width: 100 },
              { title: '排序', dataIndex: 'sortOrder', width: 60 },
              { title: '状态', dataIndex: 'isEnabled', width: 60, render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag> },
              {
                title: '扩展配置',
                dataIndex: 'extraConfig',
                ellipsis: true,
                render: (value: DictItem['extraConfig']) => value ? JSON.stringify(value).substring(0, 40) + '...' : '-',
              },
              {
                title: '操作',
                key: 'action',
                width: 60,
                render: (_: unknown, record: DictItem) => (
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditingItem(record);
                      itemForm.setFieldsValue({
                        item_code: record.itemCode,
                        item_name: record.itemName,
                        description: record.description,
                        sort_order: record.sortOrder,
                        is_enabled: record.isEnabled,
                        extra_config: record.extraConfig ? JSON.stringify(record.extraConfig, null, 2) : '',
                      });
                      setItemModal(true);
                    }}
                  />
                ),
              },
            ]}
          />
        </div>
      </div>

      <Modal title={editingType ? '编辑字典类型' : '新增字典类型'} open={typeModal} onOk={saveType} onCancel={() => { setTypeModal(false); typeForm.resetFields(); }} destroyOnClose>
        <Form form={typeForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="type_code" label="类型编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type_name" label="类型名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="sort_order" label="排序" initialValue={0}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingItem ? '编辑字典项' : '新增字典项'} open={itemModal} onOk={saveItem} onCancel={() => { setItemModal(false); itemForm.resetFields(); }} destroyOnClose width={600}>
        <Form form={itemForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="item_code" label="编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="item_name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sort_order" label="排序" initialValue={0}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
          <Form.Item name="extra_config" label="扩展配置 (JSON)"><Input.TextArea rows={4} placeholder='{"key": "value"}' /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
