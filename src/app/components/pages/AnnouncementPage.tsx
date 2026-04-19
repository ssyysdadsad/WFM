import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message, DatePicker } from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { listAnnouncements, listAnnouncementTypes, saveAnnouncement } from '@/app/services/announcement.service';
import type { AnnouncementRecord, AnnouncementTypeOption } from '@/app/types/announcement';

export function AnnouncementPage() {
  const { currentUser } = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnnouncementRecord[]>([]);
  const [types, setTypes] = useState<AnnouncementTypeOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRecord | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
    loadTypes();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const rows = await listAnnouncements();
      setData(rows);
    } catch (error) {
      message.error(getErrorMessage(error, '加载公告失败'));
    } finally {
      setLoading(false);
    }
  }

  async function loadTypes() {
    try {
      const rows = await listAnnouncementTypes();
      setTypes(rows);
    } catch (error) {
      message.error(getErrorMessage(error, '加载公告类型失败'));
    }
  }

  async function handleSave() {
    try {
      if (!currentUser?.id) {
        message.warning('当前未登录，无法保存公告');
        return;
      }

      const values = await form.validateFields();
      await saveAnnouncement(
        {
          title: values.title,
          announcementTypeDictItemId: values.announcement_type_dict_item_id,
          content: values.content,
          visibilityScopeType: values.visibility_scope_type,
          visibilityScopeConfigText: values.visibility_scope_config_text,
          publishedAt: values.published_at
            ? dayjs(values.published_at).toISOString()
            : new Date().toISOString(),
        },
        currentUser.id,
        editing?.id,
      );
      message.success(editing ? '更新成功' : '创建成功');
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '保存公告失败'));
    }
  }

  const typeMap = useMemo(() => Object.fromEntries(types.map((item) => [item.id, item.itemName])), [types]);
  const scopeLabelMap: Record<string, string> = {
    all: '全部',
    role: '按角色',
    department: '按部门',
    custom: '自定义',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>公告管理</Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              form.resetFields();
              form.setFieldsValue({
                visibility_scope_type: 'all',
                published_at: dayjs(),
                visibility_scope_config_text: JSON.stringify(
                  { role_codes: [], department_ids: [], employee_ids: [] },
                  null,
                  2,
                ),
              });
              setModalOpen(true);
            }}
          >
            新增
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        size="small"
        columns={[
          { title: '标题', dataIndex: 'title' },
          { title: '公告类型', dataIndex: 'announcementTypeDictItemId', render: (value: string) => typeMap[value] || '-' },
          {
            title: '可见范围',
            dataIndex: 'visibilityScopeType',
            render: (value: string) => <Tag color="blue">{scopeLabelMap[value] || value}</Tag>,
          },
          {
            title: '范围配置',
            dataIndex: 'visibilityScopeConfig',
            render: (value: AnnouncementRecord['visibilityScopeConfig']) =>
              value ? (
                <Typography.Text ellipsis style={{ maxWidth: 260, display: 'inline-block' }}>
                  {JSON.stringify(value)}
                </Typography.Text>
              ) : '-',
          },
          { title: '发布时间', dataIndex: 'publishedAt', render: (value: string) => value?.substring(0, 16) || '-' },
          {
            title: '操作',
            key: 'action',
            width: 80,
            render: (_: unknown, record: AnnouncementRecord) => (
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditing(record);
                  form.setFieldsValue({
                    title: record.title,
                    announcement_type_dict_item_id: record.announcementTypeDictItemId,
                    content: record.content,
                    visibility_scope_type: record.visibilityScopeType,
                    visibility_scope_config_text: record.visibilityScopeConfig
                      ? JSON.stringify(record.visibilityScopeConfig, null, 2)
                      : '',
                    published_at: record.publishedAt ? dayjs(record.publishedAt) : dayjs(),
                  });
                  setModalOpen(true);
                }}
              >
                编辑
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑公告' : '新增公告'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        destroyOnClose
        width={700}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="announcement_type_dict_item_id"
            label="公告类型"
            rules={[{ required: true, message: '请选择公告类型' }]}
          >
            <Select
              options={types.map((item) => ({ label: item.itemName, value: item.id }))}
              placeholder="请选择公告类型"
            />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入公告内容' }]}>
            <Input.TextArea rows={5} />
          </Form.Item>
          <Form.Item
            name="visibility_scope_type"
            label="可见范围"
            rules={[{ required: true, message: '请选择可见范围' }]}
          >
            <Select
              options={[
                { label: '全部', value: 'all' },
                { label: '按角色', value: 'role' },
                { label: '按部门', value: 'department' },
                { label: '自定义', value: 'custom' },
              ]}
            />
          </Form.Item>
          <Form.Item name="visibility_scope_config_text" label="范围配置(JSON)">
            <Input.TextArea rows={5} placeholder='例如 {"role_codes":["admin"],"department_ids":[],"employee_ids":[]}' />
          </Form.Item>
          <Form.Item name="published_at" label="发布时间" rules={[{ required: true, message: '请选择发布时间' }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
