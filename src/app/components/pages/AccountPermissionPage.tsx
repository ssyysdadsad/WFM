import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button, Table, Tag, Space, Modal, Form, Input, Select,
  Checkbox, Typography, message, Spin, Row, Col, Switch, Popconfirm,
} from 'antd';
import { PlusOutlined, KeyOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  listUserAccounts, createUserAccount, updateUserAccount,
  listAllPermissions, getUserDirectPermissions, setUserDirectPermissions,
  type UserAccountItem, type PermissionItem, type AccountRole, getErrorMessage,
} from '@/app/services/user-management.service';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

const { Title, Text } = Typography;

const MODULE_GROUPS = [
  { label: '基础配置', moduleKeys: ['dict', 'scene', 'device', 'skill', 'labor_rule'] },
  { label: '项目管理', moduleKeys: ['project', 'task'] },
  { label: '组织人员', moduleKeys: ['department', 'channel', 'employee'] },
  { label: '排班管理', moduleKeys: ['schedule_version', 'schedule', 'shift_change'] },
  { label: '其他',    moduleKeys: ['dashboard', 'report', 'announcement'] },
];

const ROLE_OPTIONS = [
  { label: '管理员', value: 'manager' },
  { label: '员工',   value: 'employee' },
];

const ROLE_COLORS: Record<string, string> = { admin: 'geekblue', manager: 'blue', employee: 'default' };
const ROLE_LABELS: Record<string, string> = { admin: '超级管理员', manager: '管理员', employee: '员工' };

export function AccountPermissionPage() {
  const { currentUser } = useCurrentUser();
  const [accounts, setAccounts]       = useState<UserAccountItem[]>([]);
  const [allPerms, setAllPerms]       = useState<PermissionItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [permLoading, setPermLoading] = useState(false);

  // 账号弹窗
  const [acctModal, setAcctModal]   = useState(false);
  const [editingAcct, setEditingAcct] = useState<UserAccountItem | null>(null);
  const [acctSaving, setAcctSaving] = useState(false);
  const [acctForm] = Form.useForm();

  // 权限配置弹窗
  const [permModal, setPermModal]     = useState(false);
  const [selectedAcct, setSelectedAcct] = useState<UserAccountItem | null>(null);
  const [checkedPerms, setCheckedPerms] = useState<string[]>([]);
  const [permSaving, setPermSaving]   = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accts, perms] = await Promise.all([listUserAccounts(), listAllPermissions()]);
      setAccounts(accts);
      setAllPerms(perms);
    } catch (e) {
      message.error(getErrorMessage(e, '加载数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── 账号弹窗 ────────────────────────────────────────────────
  const openCreateAcct = () => {
    setEditingAcct(null);
    setAcctModal(true);
  };

  const openEditAcct = (acct: UserAccountItem) => {
    setEditingAcct(acct);
    setAcctModal(true);
  };

  // 弹窗打开完成后再填值（避免 form 实例未挂载）
  const handleAcctModalOpen = (open: boolean) => {
    if (open) {
      if (editingAcct) {
        acctForm.setFieldsValue({
          username:  editingAcct.username,
          roleCode:  editingAcct.roleCodes.find((c) => c !== 'admin') ?? editingAcct.roleCodes[0] ?? 'manager',
          isEnabled: editingAcct.isEnabled,
        });
      } else {
        acctForm.resetFields();
      }
    }
  };

  const saveAcct = async () => {
    let values: any;
    try {
      values = await acctForm.validateFields();
    } catch {
      return;
    }
    setAcctSaving(true);
    try {
      if (editingAcct) {
        await updateUserAccount(editingAcct.id, {
          username:  values.username,
          roleCode:  values.roleCode,
          isEnabled: values.isEnabled,
        });
        message.success('账号更新成功');
      } else {
        await createUserAccount({
          username: values.username,
          password: values.password ?? '',
          roleCode: values.roleCode,
        });
        message.success('账号创建成功');
      }
      setAcctModal(false);
      await loadData();
    } catch (e) {
      message.error(getErrorMessage(e, '操作失败'));
    } finally {
      setAcctSaving(false);
    }
  };

  // ── 权限配置弹窗 ─────────────────────────────────────────────
  const openPermConfig = async (acct: UserAccountItem) => {
    setSelectedAcct(acct);
    setCheckedPerms([]);
    setPermModal(true);
    setPermLoading(true);
    try {
      const ids = await getUserDirectPermissions(acct.id);
      setCheckedPerms(ids);
    } catch (e) {
      message.error(getErrorMessage(e, '加载权限失败'));
    } finally {
      setPermLoading(false);
    }
  };

  const savePerms = async () => {
    if (!selectedAcct) return;
    setPermSaving(true);
    try {
      await setUserDirectPermissions(selectedAcct.id, checkedPerms, currentUser?.id);
      message.success('权限保存成功');
      setPermModal(false);
    } catch (e) {
      message.error(getErrorMessage(e, '保存权限失败'));
    } finally {
      setPermSaving(false);
    }
  };

  const toggleGroup = (moduleKeys: string[], checked: boolean) => {
    const groupPermIds = allPerms.filter((p) => moduleKeys.includes(p.moduleCode)).map((p) => p.id);
    setCheckedPerms((prev) =>
      checked ? [...new Set([...prev, ...groupPermIds])] : prev.filter((id) => !groupPermIds.includes(id)),
    );
  };

  // ── 表格列 ───────────────────────────────────────────────────
  const columns = [
    {
      title: '姓名 / 用户名',
      dataIndex: 'username',
      render: (v: string, r: UserAccountItem) => {
        const name = r.displayName || v;
        // Format consistently: show name, with username/phone in lighter style if different
        const isPhone = /^\d{11}$/.test(v);
        const isEmail = v.includes('@');
        const secondary = r.displayName && r.displayName !== v
          ? (isPhone ? v.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : v)
          : null;
        return (
          <Space>
            <span style={{ fontWeight: 500 }}>{name}</span>
            {secondary && <Text type="secondary" style={{ fontSize: 12 }}>({secondary})</Text>}
          </Space>
        );
      },
    },
    {
      title: '角色',
      dataIndex: 'roleCodes',
      width: 150,
      render: (codes: AccountRole[]) =>
        codes.length === 0
          ? <Tag>未分配</Tag>
          : codes.map((c) => <Tag key={c} color={ROLE_COLORS[c]}>{ROLE_LABELS[c] ?? c}</Tag>),
    },
    {
      title: '状态',
      dataIndex: 'isEnabled',
      width: 80,
      render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: '操作',
      width: 280,
      render: (_: unknown, record: UserAccountItem) => {
        const isAdminAccount = record.roleCodes.includes('admin');
        const isManagerAccount = record.roleCodes.includes('manager');
        return (
          <Space>
            <Button
              size="small" type="link" icon={<EditOutlined />}
              disabled={isAdminAccount}
              onClick={() => openEditAcct(record)}
            >编辑</Button>
            {!isAdminAccount && isManagerAccount && (
              <Button
                size="small" type="link" icon={<KeyOutlined />}
                onClick={() => openPermConfig(record)}
              >配置权限</Button>
            )}
            {!isAdminAccount && (
              <Popconfirm
                title={record.isEnabled ? '确认停用此账号？' : '确认启用此账号？'}
                description={record.isEnabled ? '停用后该用户将无法登录后台系统。' : '启用后该用户可正常登录。'}
                onConfirm={async () => {
                  try {
                    await updateUserAccount(record.id, { isEnabled: !record.isEnabled });
                    message.success(record.isEnabled ? '已停用' : '已启用');
                    await loadData();
                  } catch (e) {
                    message.error(getErrorMessage(e, '操作失败'));
                  }
                }}
                okText="确认"
                cancelText="取消"
              >
                <Button
                  type="link"
                  size="small"
                  danger={record.isEnabled}
                  style={record.isEnabled ? {} : { color: '#52c41a' }}
                >
                  {record.isEnabled ? '停用' : '启用'}
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>账号权限管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateAcct}>新增账号</Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={accounts}
        columns={columns}
        size="small"
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
      />

      {/* ── 账号弹窗 —— 不使用 destroyOnClose，避免 form 实例丢失 ── */}
      <Modal
        title={editingAcct ? '编辑账号' : '新增账号'}
        open={acctModal}
        onOk={saveAcct}
        onCancel={() => setAcctModal(false)}
        confirmLoading={acctSaving}
        afterOpenChange={handleAcctModalOpen}
      >
        <Form form={acctForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="登录用户名（唯一）" />
          </Form.Item>
          {!editingAcct && (
            <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入初始密码' }]}>
              <Input.Password placeholder="初始密码（至少6位）" />
            </Form.Item>
          )}
          <Form.Item name="roleCode" label="角色" initialValue="manager" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          {editingAcct && (
            <Form.Item name="isEnabled" label="账号状态" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* ── 权限配置弹窗 ── */}
      <Modal
        title={
          <Space><KeyOutlined /><span>配置权限：{selectedAcct?.displayName ?? ''}</span></Space>
        }
        open={permModal}
        onOk={savePerms}
        onCancel={() => setPermModal(false)}
        confirmLoading={permSaving}
        width={720}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          勾选该管理员可访问的后台模块，不勾选则不可见。超级管理员默认拥有全部权限，无需配置。
        </Text>
        <Spin spinning={permLoading}>
          <Row gutter={[0, 4]}>
            {MODULE_GROUPS.map((group) => {
              const groupPerms = allPerms.filter((p) => group.moduleKeys.includes(p.moduleCode));
              const checkedInGroup = groupPerms.filter((p) => checkedPerms.includes(p.id));
              const allChecked = groupPerms.length > 0 && checkedInGroup.length === groupPerms.length;
              const indeterminate = checkedInGroup.length > 0 && !allChecked;

              return (
                <Col span={24} key={group.label}>
                  {/* 分组标题行 */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', background: '#f0f5ff',
                      borderRadius: '6px 6px 0 0', borderBottom: '1px solid #d6e4ff',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                    onClick={() => toggleGroup(group.moduleKeys, !allChecked)}
                  >
                    <Checkbox
                      checked={allChecked}
                      indeterminate={indeterminate}
                      onChange={(e) => { e.stopPropagation(); toggleGroup(group.moduleKeys, e.target.checked); }}
                    />
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1d39c4' }}>{group.label}</span>
                    <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 'auto' }}>
                      {checkedInGroup.length}/{groupPerms.length}
                    </span>
                  </div>
                  {/* 权限复选框 */}
                  <div style={{ padding: '10px 12px', background: '#fafafa', borderRadius: '0 0 6px 6px', marginBottom: 8 }}>
                    <Checkbox.Group
                      value={checkedPerms}
                      onChange={(vals) => {
                        const groupPermIds = groupPerms.map((p) => p.id);
                        setCheckedPerms((prev) => [
                          ...prev.filter((id) => !groupPermIds.includes(id)),
                          ...(vals as string[]),
                        ]);
                      }}
                    >
                      <Row gutter={[8, 6]}>
                        {groupPerms.map((p) => (
                          <Col span={8} key={p.id}>
                            <Checkbox value={p.id} style={{ fontSize: 13 }}>{p.permissionName}</Checkbox>
                          </Col>
                        ))}
                      </Row>
                    </Checkbox.Group>
                  </div>
                </Col>
              );
            })}
          </Row>
        </Spin>
      </Modal>
    </div>
  );
}
