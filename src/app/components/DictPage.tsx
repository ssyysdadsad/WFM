import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Space, Typography, message, Tag, InputNumber, TimePicker, ColorPicker, Select } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, EditOutlined, ReloadOutlined, BookOutlined } from '@ant-design/icons';
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
    () => (selectedType ? selectedType.typeName : ''),
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
      const typeCode = editingType ? values.type_code : (values.type_code || `DT_${Date.now().toString(36).toUpperCase()}`);
      await saveDictType(
        {
          typeCode: typeCode,
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
      
      let extraConfig = null;
      if (selectedType.typeCode === 'shift_type') {
        extraConfig = {
          start_time: values.shift_start_time ? values.shift_start_time.format('HH:mm') : null,
          end_time: values.shift_end_time ? values.shift_end_time.format('HH:mm') : null,
          planned_hours: values.shift_planned_hours,
          count_as_hours: values.shift_count_as_hours,
          color: typeof values.shift_color === 'string' ? values.shift_color : (values.shift_color?.toHexString() || '#1677ff'),
        };
      } else if (selectedType.typeCode === 'schedule_code') {
        extraConfig = {
          excel_code: values.sc_excel_code || null,
          aliases: values.sc_aliases || [],
          category: values.sc_category || null,
          count_as_hours: values.sc_count_as_hours,
          standard_hours: values.sc_standard_hours,
          start_time: values.sc_start_time ? values.sc_start_time.format('HH:mm') : null,
          end_time: values.sc_end_time ? values.sc_end_time.format('HH:mm') : null,
          planned_hours: values.sc_standard_hours,
          color: typeof values.sc_color === 'string' ? values.sc_color : (values.sc_color?.toHexString() || '#10B981'),
          allow_empty_task: values.sc_allow_empty_task,
          allow_empty_device: values.sc_allow_empty_device,
        };
      } else {
        extraConfig = parseDictExtraConfig(values.extra_config);
      }

      const itemCode = editingItem ? values.item_code : (values.item_code || `DI_${Date.now().toString(36).toUpperCase()}`);

      await saveDictItem(
        selectedType.id,
        {
          itemCode: itemCode,
          itemName: values.item_name,
          description: values.description,
          extraConfig,
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
      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 180px)' }}>
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Typography.Text strong>字典项 {selectedType ? `- ${selectedTypeLabel}` : ''}</Typography.Text>
            <Button size="small" type="primary" icon={<PlusOutlined />} disabled={!selectedType} onClick={() => { 
              setEditingItem(null); 
              itemForm.resetFields(); 
              if (selectedType?.typeCode === 'shift_type') {
                itemForm.setFieldsValue({
                  shift_planned_hours: 8,
                  shift_count_as_hours: true,
                  shift_color: '#1677ff'
                });
              } else if (selectedType?.typeCode === 'schedule_code') {
                itemForm.setFieldsValue({
                  sc_category: 'work',
                  sc_count_as_hours: true,
                  sc_standard_hours: 8,
                  sc_start_time: dayjs('09:00', 'HH:mm'),
                  sc_end_time: dayjs('18:00', 'HH:mm'),
                  sc_color: '#10B981',
                  sc_allow_empty_task: true,
                  sc_allow_empty_device: true,
                });
              }
              setItemModal(true); 
            }}>新增</Button>
          </div>
          {!selectedType ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: 300, color: '#bbb', gap: 12,
            }}>
              <BookOutlined style={{ fontSize: 48, opacity: 0.3 }} />
              <Typography.Text type="secondary">请点击左侧列表选择一个字典类型</Typography.Text>
            </div>
          ) : (
          <Table
            rowKey="id" size="small" dataSource={items} pagination={false}
            columns={[
              { title: '名称', dataIndex: 'itemName', width: 80 },
              // Show extra columns when viewing schedule_code type
              ...(selectedType?.typeCode === 'schedule_code' ? [
                {
                  title: '', width: 30,
                  render: (_: unknown, record: DictItem) => {
                    const ec = (record.extraConfig || {}) as Record<string, any>;
                    const color = ec.color || '#d9d9d9';
                    return <div style={{ width: 16, height: 16, borderRadius: 4, background: color, border: '1px solid rgba(0,0,0,0.1)' }} />;
                  },
                },
                {
                  title: '上班', width: 65,
                  render: (_: unknown, record: DictItem) => {
                    const ec = (record.extraConfig || {}) as Record<string, any>;
                    return ec.start_time ? <span style={{ fontSize: 12, color: '#333' }}>{String(ec.start_time).slice(0,5)}</span> : <span style={{ color: '#ccc' }}>-</span>;
                  },
                },
                {
                  title: '下班', width: 65,
                  render: (_: unknown, record: DictItem) => {
                    const ec = (record.extraConfig || {}) as Record<string, any>;
                    return ec.end_time ? <span style={{ fontSize: 12, color: '#333' }}>{String(ec.end_time).slice(0,5)}</span> : <span style={{ color: '#ccc' }}>-</span>;
                  },
                },
                {
                  title: '工时', width: 55,
                  render: (_: unknown, record: DictItem) => {
                    const ec = (record.extraConfig || {}) as Record<string, any>;
                    return ec.standard_hours ? <span style={{ fontSize: 12 }}>{ec.standard_hours}h</span> : <span style={{ color: '#ccc' }}>-</span>;
                  },
                },
                {
                  title: '类别', width: 60,
                  render: (_: unknown, record: DictItem) => {
                    const ec = (record.extraConfig || {}) as Record<string, any>;
                    const catMap: Record<string, { label: string; color: string }> = {
                      work: { label: '工作', color: 'blue' },
                      rest: { label: '休', color: 'default' },
                      leave: { label: '假', color: 'orange' },
                      training: { label: '训', color: 'purple' },
                    };
                    const cat = catMap[ec.category] || { label: ec.category || '-', color: 'default' };
                    return <Tag color={cat.color} style={{ fontSize: 11 }}>{cat.label}</Tag>;
                  },
                },
              ] : []),
              { title: '状态', dataIndex: 'isEnabled', width: 60, render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag> },
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
                      const isShiftType = selectedType?.typeCode === 'shift_type';
                      const isScheduleCode = selectedType?.typeCode === 'schedule_code';
                      const parsedExtra: Record<string, any> = (record.extraConfig || {}) as Record<string, any>;
                      
                      itemForm.setFieldsValue({
                        item_code: record.itemCode,
                        item_name: record.itemName,
                        description: record.description,
                        sort_order: record.sortOrder,
                        is_enabled: record.isEnabled,
                        extra_config: record.extraConfig ? JSON.stringify(record.extraConfig, null, 2) : '',
                        ...(isShiftType && {
                          shift_start_time: parsedExtra.start_time ? dayjs(parsedExtra.start_time, 'HH:mm') : null,
                          shift_end_time: parsedExtra.end_time ? dayjs(parsedExtra.end_time, 'HH:mm') : null,
                          shift_planned_hours: parsedExtra.planned_hours ?? 8,
                          shift_count_as_hours: parsedExtra.count_as_hours ?? true,
                          shift_color: parsedExtra.color ?? '#1677ff',
                        }),
                        ...(isScheduleCode && {
                          sc_excel_code: parsedExtra.excel_code ?? '',
                          sc_aliases: parsedExtra.aliases ?? [],
                          sc_category: parsedExtra.category ?? 'work',
                          sc_count_as_hours: parsedExtra.count_as_hours ?? true,
                          sc_standard_hours: parsedExtra.standard_hours ?? 8,
                          sc_start_time: parsedExtra.start_time ? dayjs(parsedExtra.start_time, 'HH:mm') : null,
                          sc_end_time: parsedExtra.end_time ? dayjs(parsedExtra.end_time, 'HH:mm') : null,
                          sc_color: parsedExtra.color ?? '#10B981',
                          sc_allow_empty_task: parsedExtra.allow_empty_task ?? true,
                          sc_allow_empty_device: parsedExtra.allow_empty_device ?? true,
                        })
                      });
                      setItemModal(true);
                    }}
                  />
                ),
              },
            ]}
          />
          )}
        </div>
      </div>

      <Modal title={editingType ? '编辑字典类型' : '新增字典类型'} open={typeModal} onOk={saveType} onCancel={() => { setTypeModal(false); typeForm.resetFields(); }} destroyOnClose>
        <Form form={typeForm} layout="vertical" style={{ marginTop: 16 }}>
          {editingType ? (
            <Form.Item name="type_code" label="类型编码">
              <Input disabled style={{ color: '#333', backgroundColor: '#f5f5f5' }} />
            </Form.Item>
          ) : null}
          <Form.Item name="type_name" label="类型名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingItem ? '编辑字典项' : '新增字典项'} open={itemModal} onOk={saveItem} onCancel={() => { setItemModal(false); itemForm.resetFields(); }} destroyOnClose width={600}>
        <Form form={itemForm} layout="vertical" style={{ marginTop: 16 }}>
          {editingItem ? (
            <Form.Item name="item_code" label="编码">
              <Input disabled style={{ color: '#333', backgroundColor: '#f5f5f5' }} />
            </Form.Item>
          ) : null}
          <Form.Item name="item_name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="is_enabled" label="是否启用" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
          {selectedType?.typeCode === 'shift_type' ? (
            <Space size="large" align="start" style={{ display: 'flex', flexWrap: 'wrap' }}>
              <Form.Item name="shift_start_time" label="上班时间" rules={[{ required: true }]}>
                <TimePicker format="HH:mm" style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="shift_end_time" label="下班时间" rules={[{ required: true }]}>
                <TimePicker format="HH:mm" style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="shift_planned_hours" label="排班工时" rules={[{ required: true }]}>
                <InputNumber min={0} step={0.5} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="shift_count_as_hours" label="计入工时" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="shift_color" label="班次颜色">
                <ColorPicker showText />
              </Form.Item>
            </Space>
          ) : selectedType?.typeCode === 'schedule_code' ? (
            <Space size="large" align="start" style={{ display: 'flex', flexWrap: 'wrap' }}>
              <Form.Item name="sc_excel_code" label="Excel识别码" rules={[{ required: true }]} style={{ width: 120 }}>
                <Input />
              </Form.Item>
              <Form.Item name="sc_aliases" label="同义别名 (回车键增加)" style={{ width: 220 }}>
                <Select mode="tags" placeholder="例如: 捕1, 早退" open={false} />
              </Form.Item>
              <Form.Item name="sc_start_time" label="上班时间" rules={[{ required: true }]} style={{ width: 140 }}>
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="sc_end_time" label="下班时间" rules={[{ required: true }]} style={{ width: 140 }}>
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="sc_category" label="分类" style={{ width: 100 }}>
                <Select options={[
                  { label: '工作', value: 'work' },
                  { label: '休息', value: 'rest' },
                  { label: '请假', value: 'leave' },
                  { label: '培训', value: 'training' },
                ]} />
              </Form.Item>
              <Form.Item name="sc_standard_hours" label="标准工时" rules={[{ required: true }]} style={{ width: 120 }}>
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="sc_count_as_hours" label="计入工时" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="sc_allow_empty_task" label="允许空任务" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="sc_allow_empty_device" label="允许空设备" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="sc_color" label="标签颜色">
                <ColorPicker showText />
              </Form.Item>
            </Space>
          ) : null}
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
