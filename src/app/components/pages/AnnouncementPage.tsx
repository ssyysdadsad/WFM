import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message, DatePicker, Card, Tooltip, Badge, Empty, Divider, Switch } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, NotificationOutlined, TeamOutlined, CalendarOutlined, EyeOutlined, FileTextOutlined, SearchOutlined, PushpinOutlined, PushpinFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '@/app/lib/supabase/client';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { listAnnouncements, listAnnouncementTypes, saveAnnouncement, deleteAnnouncement, toggleAnnouncementPin, createAnnouncementType } from '@/app/services/announcement.service';
import type { AnnouncementRecord, AnnouncementTypeOption } from '@/app/types/announcement';

type DeptOption = { id: string; name: string };

// 公告类型对应颜色
const TYPE_COLOR_MAP: Record<string, string> = {
  '系统通知': '#2563EB',
  '排班发布': '#059669',
  '规章制度': '#7C3AED',
  '节假日': '#EA580C',
  '培训通知': '#0891B2',
  '人事变动': '#C026D3',
};
const DEFAULT_TYPE_COLOR = '#6B7280';

function getTypeColor(typeName: string) {
  return TYPE_COLOR_MAP[typeName] || DEFAULT_TYPE_COLOR;
}

// 可见范围图标/颜色
const SCOPE_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  all:        { color: 'green',   icon: <TeamOutlined />,          label: '全部员工' },
  role:       { color: 'blue',    icon: <EyeOutlined />,           label: '按角色' },
  department: { color: 'orange',  icon: <TeamOutlined />,          label: '按部门' },
  custom:     { color: 'purple',  icon: <EyeOutlined />,           label: '自定义' },
};

export function AnnouncementPage() {
  const { currentUser } = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnnouncementRecord[]>([]);
  const [types, setTypes] = useState<AnnouncementTypeOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRecord | null>(null);
  const [scopeType, setScopeType] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [previewRecord, setPreviewRecord] = useState<AnnouncementRecord | null>(null);
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

  async function handleTogglePin(record: AnnouncementRecord) {
    try {
      await toggleAnnouncementPin(record.id, !record.isPinned);
      message.success(record.isPinned ? '已取消置顶' : '已置顶');
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '操作失败'));
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

      // 如果用户输入了自定义类型名称（非已有id），先创建
      let typeId = values.announcement_type_dict_item_id;
      if (typeId && !types.find(t => t.id === typeId)) {
        const newType = await createAnnouncementType(typeId);
        typeId = newType.id;
        await loadTypes();
      }

      await saveAnnouncement(
        {
          title: values.title,
          announcementTypeDictItemId: typeId,
          content: values.content,
          visibilityScopeType: values.visibility_scope_type,
          visibilityScopeConfigText: scopeConfigText,
          isPinned: values.is_pinned ?? false,
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

  const ROLE_OPTIONS = [
    { label: '管理员', value: 'admin' },
    { label: '经理', value: 'manager' },
    { label: '主管', value: 'supervisor' },
    { label: '员工', value: 'employee' },
  ];

  // 过滤数据
  const filteredData = useMemo(() => {
    let result = data;
    if (searchText) {
      const keyword = searchText.toLowerCase();
      result = result.filter(r => r.title.toLowerCase().includes(keyword) || r.content?.toLowerCase().includes(keyword));
    }
    if (filterType) {
      result = result.filter(r => r.announcementTypeDictItemId === filterType);
    }
    return result;
  }, [data, searchText, filterType]);

  // 统计数字
  const stats = useMemo(() => {
    const total = data.length;
    const thisMonth = data.filter(r => dayjs(r.publishedAt).isSame(dayjs(), 'month')).length;
    const typeCount = new Set(data.map(r => r.announcementTypeDictItemId)).size;
    return { total, thisMonth, typeCount };
  }, [data]);

  // Parse scope config for display
  function renderScopeDetail(record: AnnouncementRecord) {
    const cfg = SCOPE_CONFIG[record.visibilityScopeType] || SCOPE_CONFIG.all;
    const scopeCfg = record.visibilityScopeConfig as any;

    if (record.visibilityScopeType === 'all') {
      return <Tag icon={cfg.icon} color={cfg.color}>{cfg.label}</Tag>;
    }

    const parts: string[] = [];
    if (scopeCfg?.role_codes?.length) {
      const roleLabels = (scopeCfg.role_codes as string[]).map(c => ROLE_OPTIONS.find(r => r.value === c)?.label || c);
      parts.push(roleLabels.join('、'));
    }
    if (scopeCfg?.department_ids?.length) {
      const deptNames = (scopeCfg.department_ids as string[]).map(id => deptMap[id] || id.substring(0, 8));
      parts.push(deptNames.join('、'));
    }

    return (
      <Tooltip title={parts.length > 0 ? parts.join(' | ') : cfg.label}>
        <Tag icon={cfg.icon} color={cfg.color}>
          {parts.length > 0 ? (
            <span style={{ maxWidth: 160, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
              {parts.join(' | ')}
            </span>
          ) : cfg.label}
        </Tag>
      </Tooltip>
    );
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
      is_pinned: record.isPinned ?? false,
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
      is_pinned: false,
    });
    setModalOpen(true);
  }

  return (
    <div>
      {/* 页面标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(59,130,246,0.25)',
          }}>
            <NotificationOutlined style={{ color: '#fff', fontSize: 18 }} />
          </div>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>公告管理</Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>管理企业公告的发布与维护</Typography.Text>
          </div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNewForm}
            style={{ background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', border: 'none', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}
          >新增公告</Button>
        </Space>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <Card size="small" style={{ borderRadius: 12, border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileTextOutlined style={{ fontSize: 20, color: '#3B82F6' }} />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1E293B', lineHeight: 1.2 }}>{stats.total}</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>公告总数</div>
            </div>
          </div>
        </Card>
        <Card size="small" style={{ borderRadius: 12, border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CalendarOutlined style={{ fontSize: 20, color: '#059669' }} />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1E293B', lineHeight: 1.2 }}>{stats.thisMonth}</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>本月发布</div>
            </div>
          </div>
        </Card>
        <Card size="small" style={{ borderRadius: 12, border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <NotificationOutlined style={{ fontSize: 20, color: '#7C3AED' }} />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1E293B', lineHeight: 1.2 }}>{stats.typeCount}</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>公告类型</div>
            </div>
          </div>
        </Card>
      </div>

      {/* 搜索/筛选栏 */}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 16, border: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="搜索公告标题或内容..."
            allowClear
            style={{ width: 280, borderRadius: 8 }}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
          <Select
            placeholder="公告类型筛选"
            allowClear
            style={{ width: 180, borderRadius: 8 }}
            value={filterType}
            onChange={val => setFilterType(val)}
            options={types.map(t => ({ label: t.itemName, value: t.id }))}
          />
          <div style={{ flex: 1 }} />
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            共 <strong>{filteredData.length}</strong> 条公告
          </Typography.Text>
        </div>
      </Card>

      {/* 表格 */}
      <Card style={{ borderRadius: 12, border: '1px solid #E5E7EB' }} bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredData}
          size="middle"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: total => `共 ${total} 条` }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无公告" /> }}
          columns={[
            {
              title: '公告信息',
              key: 'info',
              render: (_: unknown, record: AnnouncementRecord) => {
                const typeName = typeMap[record.announcementTypeDictItemId] || '-';
                const typeColor = getTypeColor(typeName);
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 0' }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                      background: `${typeColor}14`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${typeColor}25`,
                    }}>
                      <NotificationOutlined style={{ fontSize: 18, color: typeColor }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {record.isPinned && <PushpinFilled style={{ color: '#F59E0B', fontSize: 13, flexShrink: 0 }} />}
                        {record.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                        {record.content || '暂无内容'}
                      </div>
                    </div>
                  </div>
                );
              },
            },
            {
              title: '公告类型',
              dataIndex: 'announcementTypeDictItemId',
              width: 130,
              render: (value: string) => {
                const name = typeMap[value] || '-';
                const color = getTypeColor(name);
                return (
                  <Tag style={{
                    color, background: `${color}12`, border: `1px solid ${color}30`,
                    borderRadius: 6, fontWeight: 600, fontSize: 12,
                  }}>
                    {name}
                  </Tag>
                );
              },
            },
            {
              title: '可见范围',
              key: 'scope',
              width: 200,
              render: (_: unknown, record: AnnouncementRecord) => renderScopeDetail(record),
            },
            {
              title: '发布时间',
              dataIndex: 'publishedAt',
              width: 170,
              sorter: (a: AnnouncementRecord, b: AnnouncementRecord) => dayjs(a.publishedAt).unix() - dayjs(b.publishedAt).unix(),
              defaultSortOrder: 'descend' as const,
              render: (value: string) => {
                if (!value) return <span style={{ color: '#CBD5E1' }}>-</span>;
                const d = dayjs(value);
                const isToday = d.isSame(dayjs(), 'day');
                return (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>
                      {isToday ? <Badge status="processing" text={<span style={{ color: '#3B82F6', fontWeight: 600 }}>今天</span>} /> : d.format('YYYY-MM-DD')}
                    </div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>{d.format('HH:mm')}</div>
                  </div>
                );
              },
            },
            {
              title: '操作',
              key: 'action',
              width: 230,
              render: (_: unknown, record: AnnouncementRecord) => (
                <Space size={4}>
                  <Tooltip title={record.isPinned ? '取消置顶' : '置顶'}>
                    <Button type="text" size="small"
                      icon={record.isPinned ? <PushpinFilled /> : <PushpinOutlined />}
                      style={{ color: record.isPinned ? '#F59E0B' : '#6B7280' }}
                      onClick={() => handleTogglePin(record)}
                    />
                  </Tooltip>
                  <Tooltip title="预览内容">
                    <Button type="text" size="small" icon={<EyeOutlined />}
                      style={{ color: '#6B7280' }}
                      onClick={() => setPreviewRecord(record)}
                    />
                  </Tooltip>
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
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: editing ? 'linear-gradient(135deg, #F59E0B, #D97706)' : 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {editing ? <EditOutlined style={{ color: '#fff', fontSize: 14 }} /> : <PlusOutlined style={{ color: '#fff', fontSize: 14 }} />}
            </div>
            <span>{editing ? '编辑公告' : '新增公告'}</span>
          </div>
        }
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
        okText={editing ? '更新' : '发布'}
        okButtonProps={{
          style: {
            background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
            border: 'none',
            boxShadow: '0 4px 12px rgba(59,130,246,0.25)',
          },
        }}
      >
        <Divider style={{ margin: '12px 0 20px' }} />
        <Form form={form} layout="vertical" style={{ marginTop: 0 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入公告标题" style={{ borderRadius: 8 }} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="announcement_type_dict_item_id"
              label="公告类型"
              rules={[{ required: true, message: '请选择或输入公告类型' }]}
            >
              <Select
                showSearch
                allowClear
                placeholder="选择或输入新类型"
                style={{ borderRadius: 8 }}
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
                options={types.map((item) => ({ label: item.itemName, value: item.id }))}
                notFoundContent={
                  <div style={{ padding: '8px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                    <PlusOutlined style={{ marginRight: 4 }} />输入名称后将自动创建新类型
                  </div>
                }
                onSearch={() => {}}
                onInputKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value?.trim();
                    if (val && !types.find(t => t.itemName === val)) {
                      form.setFieldValue('announcement_type_dict_item_id', val);
                    }
                  }
                }}
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <Divider style={{ margin: '6px 0' }} />
                    <div style={{ padding: '4px 12px 8px', fontSize: 12, color: '#94A3B8' }}>
                      💡 可直接输入新类型名称并按回车
                    </div>
                  </>
                )}
              />
            </Form.Item>
            <Form.Item name="published_at" label="发布时间" rules={[{ required: true, message: '请选择发布时间' }]}>
              <DatePicker showTime style={{ width: '100%', borderRadius: 8 }} />
            </Form.Item>
          </div>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入公告内容' }]}>
            <Input.TextArea rows={5} placeholder="请输入公告内容..." style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="is_pinned" label="置顶" valuePropName="checked">
            <Switch checkedChildren="置顶" unCheckedChildren="普通" />
          </Form.Item>
          <Form.Item
            name="visibility_scope_type"
            label="可见范围"
            rules={[{ required: true, message: '请选择可见范围' }]}
          >
            <Select
              options={[
                { label: '🌍 全部员工', value: 'all' },
                { label: '🔑 按角色', value: 'role' },
                { label: '🏢 按部门', value: 'department' },
              ]}
              onChange={(val: string) => setScopeType(val)}
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          {/* Visual scope selectors based on type */}
          {scopeType === 'role' && (
            <Form.Item name="scope_roles" label="选择角色" rules={[{ required: true, message: '请选择至少一个角色' }]}>
              <Select
                mode="multiple"
                placeholder="请选择可见角色"
                options={ROLE_OPTIONS}
                style={{ borderRadius: 8 }}
              />
            </Form.Item>
          )}

          {scopeType === 'department' && (
            <Form.Item name="scope_departments" label="选择部门" rules={[{ required: true, message: '请选择至少一个部门' }]}>
              <Select
                mode="multiple"
                placeholder="请选择可见部门"
                options={departments.map(d => ({ label: d.name, value: d.id }))}
                style={{ borderRadius: 8 }}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 预览弹窗 */}
      <Modal
        title={null}
        open={!!previewRecord}
        onCancel={() => setPreviewRecord(null)}
        footer={<Button onClick={() => setPreviewRecord(null)}>关闭</Button>}
        width={600}
      >
        {previewRecord && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: `${getTypeColor(typeMap[previewRecord.announcementTypeDictItemId] || '')}14`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${getTypeColor(typeMap[previewRecord.announcementTypeDictItemId] || '')}25`,
              }}>
                <NotificationOutlined style={{ fontSize: 22, color: getTypeColor(typeMap[previewRecord.announcementTypeDictItemId] || '') }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#1E293B' }}>{previewRecord.title}</div>
                <Space size={8} style={{ marginTop: 4 }}>
                  {(() => {
                    const name = typeMap[previewRecord.announcementTypeDictItemId] || '-';
                    const color = getTypeColor(name);
                    return <Tag style={{ color, background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 6, fontWeight: 600, fontSize: 12 }}>{name}</Tag>;
                  })()}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <CalendarOutlined style={{ marginRight: 4 }} />
                    {dayjs(previewRecord.publishedAt).format('YYYY-MM-DD HH:mm')}
                  </Typography.Text>
                </Space>
              </div>
            </div>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{
              background: '#F8FAFC', borderRadius: 10, padding: '20px 24px',
              fontSize: 14, lineHeight: 1.8, color: '#334155',
              whiteSpace: 'pre-wrap', minHeight: 120,
              border: '1px solid #E2E8F0',
            }}>
              {previewRecord.content || '暂无内容'}
            </div>
            <div style={{ marginTop: 16 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                <EyeOutlined style={{ marginRight: 4 }} />可见范围：
              </Typography.Text>
              {renderScopeDetail(previewRecord)}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
