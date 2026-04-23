import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message, DatePicker } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '@/app/lib/supabase/client';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { listAnnouncements, listAnnouncementTypes, saveAnnouncement, deleteAnnouncement } from '@/app/services/announcement.service';
import type { AnnouncementRecord, AnnouncementTypeOption } from '@/app/types/announcement';

type DeptOption = { id: string; name: string };

export function AnnouncementPage() {
  const { currentUser } = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnnouncementRecord[]>([]);
  const [types, setTypes] = useState<AnnouncementTypeOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRecord | null>(null);
  const [scopeType, setScopeType] = useState<string>('all');
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
    loadTypes();
    loadDepartments();
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

  async function loadDepartments() {
    try {
      const { data: rows } = await supabase.from('department').select('id, department_name').eq('is_enabled', true).order('department_name');
      setDepartments((rows || []).map((r: any) => ({ id: r.id, name: r.department_name })));
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAnnouncement(id);
      message.success('删除成功');
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '删除失败'));
    }
  }

  // Build JSON config from visual selectors
  function buildScopeConfig(): string | undefined {
    const st = form.getFieldValue('visibility_scope_type');
    if (st === 'all') return undefined;

    const config: Record<string, any> = {
      role_codes: [],
      department_ids: [],
      employee_ids: [],
    };

    if (st === 'role') {
      config.role_codes = form.getFieldValue('scope_roles') || [];
    } else if (st === 'department') {
      config.department_ids = form.getFieldValue('scope_departments') || [];
    }

    return JSON.stringify(config);
  }

  async function handleSave() {
    try {
      if (!currentUser?.id) {
        message.warning('当前未登录，无法保存公告');
        return;
      }

      const values = await form.validateFields();
      const scopeConfigText = buildScopeConfig();

      await saveAnnouncement(
        {
          title: values.title,
          announcementTypeDictItemId: values.announcement_type_dict_item_id,
          content: values.content,
          visibilityScopeType: values.visibility_scope_type,
          visibilityScopeConfigText: scopeConfigText,
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
      setScopeType('all');
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '保存公告失败'));
    }
  }

  const typeMap = useMemo(() => Object.fromEntries(types.map((item) => [item.id, item.itemName])), [types]);
  const deptMap = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d.name])), [departments]);

  const scopeLabelMap: Record<string, string> = {
    all: '全部员工',
    role: '按角色',
    department: '按部门',
    custom: '自定义',
  };

  const ROLE_OPTIONS = [
    { label: '管理员', value: 'admin' },
    { label: '经理', value: 'manager' },
    { label: '主管', value: 'supervisor' },
    { label: '员工', value: 'employee' },
  ];

  // Parse scope config for display
  function renderScopeDetail(record: AnnouncementRecord) {
    if (record.visibilityScopeType === 'all') return <Tag color="green">全部员工</Tag>;

    const cfg = record.visibilityScopeConfig as any;
    if (!cfg) return <Tag color="blue">{scopeLabelMap[record.visibilityScopeType] || '-'}</Tag>;

    const parts: string[] = [];
    if (cfg.role_codes?.length) {
      const roleLabels = (cfg.role_codes as string[]).map(c => ROLE_OPTIONS.find(r => r.value === c)?.label || c);
      parts.push(`角色: ${roleLabels.join('、')}`);
    }
    if (cfg.department_ids?.length) {
      const deptNames = (cfg.department_ids as string[]).map(id => deptMap[id] || id.substring(0, 8));
      parts.push(`部门: ${deptNames.join('、')}`);
    }

    return parts.length > 0
      ? <Typography.Text ellipsis style={{ maxWidth: 200, display: 'inline-block' }}>{parts.join(' | ')}</Typography.Text>
      : <Tag color="blue">{scopeLabelMap[record.visibilityScopeType] || '-'}</Tag>;
  }

  // Open form with parsed config
  function openEditForm(record: AnnouncementRecord) {
    setEditing(record);
    setScopeType(record.visibilityScopeType || 'all');
    const cfg = record.visibilityScopeConfig as any;
    form.setFieldsValue({
      title: record.title,
      announcement_type_dict_item_id: record.announcementTypeDictItemId,
      content: record.content,
      visibility_scope_type: record.visibilityScopeType,
      scope_roles: cfg?.role_codes || [],
      scope_departments: cfg?.department_ids || [],
      published_at: record.publishedAt ? dayjs(record.publishedAt) : dayjs(),
    });
    setModalOpen(true);
  }

  function openNewForm() {
    setEditing(null);
    setScopeType('all');
    form.resetFields();
    form.setFieldsValue({
      visibility_scope_type: 'all',
      published_at: dayjs(),
    });
    setModalOpen(true);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>公告管理</Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNewForm}>新增</Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        size="small"
        columns={[
          { title: '标题', dataIndex: 'title', ellipsis: true },
          { title: '公告类型', dataIndex: 'announcementTypeDictItemId', width: 120, render: (value: string) => <Tag>{typeMap[value] || '-'}</Tag> },
          {
            title: '可见范围',
            key: 'scope',
            width: 240,
            render: (_: unknown, record: AnnouncementRecord) => renderScopeDetail(record),
          },
          { title: '发布时间', dataIndex: 'publishedAt', width: 160, render: (value: string) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-' },
          {
            title: '操作',
            key: 'action',
            width: 150,
            render: (_: unknown, record: AnnouncementRecord) => (
              <Space size={0}>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditForm(record)}>编辑</Button>
                <Popconfirm
                  title="确认删除"
                  description="删除后无法恢复，确认继续？"
                  okText="删除"
                  okType="danger"
                  cancelText="取消"
                  onConfirm={() => handleDelete(record.id)}
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
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
          setScopeType('all');
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
                { label: '全部员工', value: 'all' },
                { label: '按角色', value: 'role' },
                { label: '按部门', value: 'department' },
              ]}
              onChange={(val: string) => setScopeType(val)}
            />
          </Form.Item>

          {/* Visual scope selectors based on type */}
          {scopeType === 'role' && (
            <Form.Item name="scope_roles" label="选择角色" rules={[{ required: true, message: '请选择至少一个角色' }]}>
              <Select
                mode="multiple"
                placeholder="请选择可见角色"
                options={ROLE_OPTIONS}
              />
            </Form.Item>
          )}

          {scopeType === 'department' && (
            <Form.Item name="scope_departments" label="选择部门" rules={[{ required: true, message: '请选择至少一个部门' }]}>
              <Select
                mode="multiple"
                placeholder="请选择可见部门"
                options={departments.map(d => ({ label: d.name, value: d.id }))}
              />
            </Form.Item>
          )}

          <Form.Item name="published_at" label="发布时间" rules={[{ required: true, message: '请选择发布时间' }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
