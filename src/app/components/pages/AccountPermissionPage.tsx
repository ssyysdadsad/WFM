import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Table, Tag, Space, Modal, Form, Input, Select,
  Checkbox, Typography, message, Spin, Row, Col, Switch, Popconfirm,
  Alert, Tabs, Badge, Tooltip,
} from 'antd';
import {
  PlusOutlined, KeyOutlined, EditOutlined, ReloadOutlined,
  UsergroupAddOutlined, DeleteOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  listUserAccounts, createUserAccount, updateUserAccount, deleteUserAccount, batchDeleteAccounts,
  listAllPermissions, getUserDirectPermissions, setUserDirectPermissions,
  getUnprovisionedEmployees, batchProvisionAccounts,
  type UserAccountItem, type PermissionItem, type AccountRole,
  type UnprovisionedEmployee, getErrorMessage,
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
  const [activeTab, setActiveTab]     = useState<string>('admin');

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

  // 批量开通弹窗
  const [batchModal, setBatchModal]   = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [unprovisionedEmps, setUnprovisionedEmps] = useState<UnprovisionedEmployee[]>([]);
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [batchResult, setBatchResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  // 员工批量选择（用于批量删除）
  const [selectedEmployeeAcctIds, setSelectedEmployeeAcctIds] = useState<string[]>([]);

  // ── 分组数据 ─────────────────────────────────────────────────
  const adminAccounts = useMemo(
    () => accounts.filter(a => a.roleCodes.includes('admin') || a.roleCodes.includes('manager')),
    [accounts],
  );
  const employeeAccounts = useMemo(
    () => accounts.filter(a => !a.roleCodes.includes('admin') && !a.roleCodes.includes('manager')),
    [accounts],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accts, perms] = await Promise.all([listUserAccounts(), listAllPermissions()]);
      setAccounts(accts);
      setAllPerms(perms);
      setSelectedEmployeeAcctIds([]);
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

  // ── 删除账号 ────────────────────────────────────────────────
  const handleDelete = async (acct: UserAccountItem) => {
    try {
      await deleteUserAccount(acct.id);
      message.success(`已删除账号: ${acct.displayName}`);
      await loadData();
    } catch (e) {
      message.error(getErrorMessage(e, '删除失败'));
    }
  };

  const handleBatchDelete = () => {
    if (selectedEmployeeAcctIds.length === 0) return;
    Modal.confirm({
      title: '批量删除确认',
      icon: <ExclamationCircleOutlined />,
      content: `确定删除选中的 ${selectedEmployeeAcctIds.length} 个员工账号？删除后员工将无法登录小程序。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const result = await batchDeleteAccounts(selectedEmployeeAcctIds);
        message.success(`成功删除 ${result.success} 个账号${result.failed > 0 ? `，失败 ${result.failed} 个` : ''}`);
        await loadData();
      },
    });
  };

  // ── 批量开通 ────────────────────────────────────────────────
  const openBatchProvision = async () => {
    setBatchModal(true);
    setBatchResult(null);
    setSelectedEmpIds([]);
    setBatchLoading(true);
    try {
      const emps = await getUnprovisionedEmployees();
      setUnprovisionedEmps(emps);
      setSelectedEmpIds(emps.map(e => e.id));
    } catch (e) {
      message.error(getErrorMessage(e, '加载员工数据失败'));
    } finally {
      setBatchLoading(false);
    }
  };

  const executeBatchProvision = async () => {
    if (selectedEmpIds.length === 0) return;
    setBatchSaving(true);
    try {
      const result = await batchProvisionAccounts(selectedEmpIds);
      setBatchResult(result);
      if (result.success > 0) {
        message.success(`成功开通 ${result.success} 个员工账号`);
      }
    } catch (e) {
      message.error(getErrorMessage(e, '批量开通失败'));
    } finally {
      setBatchSaving(false);
    }
  };

  const toggleGroup = (moduleKeys: string[], checked: boolean) => {
    const groupPermIds = allPerms.filter((p) => moduleKeys.includes(p.moduleCode)).map((p) => p.id);
    setCheckedPerms((prev) =>
      checked ? [...new Set([...prev, ...groupPermIds])] : prev.filter((id) => !groupPermIds.includes(id)),
    );
  };

  // ── 管理员表格列 ─────────────────────────────────────────────
  const adminColumns = [
    {
      title: '姓名 / 用户名',
      dataIndex: 'username',
      render: (v: string, r: UserAccountItem) => {
        const name = r.displayName || v;
        const isPhone = /^\d{11}$/.test(v);
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
      width: 320,
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
                description={record.isEnabled ? '停用后该用户将无法登录。' : '启用后该用户可正常登录。'}
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
                <Button type="link" size="small" danger={record.isEnabled}
                  style={record.isEnabled ? {} : { color: '#52c41a' }}>
                  {record.isEnabled ? '停用' : '启用'}
                </Button>
              </Popconfirm>
            )}
            {!isAdminAccount && (
              <Popconfirm
                title="确认删除此账号？"
                description="删除后不可恢复，该用户将无法登录系统。"
                onConfirm={() => handleDelete(record)}
                okText="确认删除"
                okType="danger"
                cancelText="取消"
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  // ── 员工表格列 ───────────────────────────────────────────────
  const employeeColumns = [
    {
      title: '姓名',
      dataIndex: 'displayName',
      width: 100,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '用户名（手机号）',
      dataIndex: 'username',
      width: 150,
      render: (v: string) => {
        const isPhone = /^\d{11}$/.test(v);
        return isPhone
          ? <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{v.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</span>
          : <span style={{ fontSize: 13 }}>{v}</span>;
      },
    },
    {
      title: '状态',
      dataIndex: 'isEnabled',
      width: 80,
      filters: [
        { text: '启用', value: true },
        { text: '停用', value: false },
      ],
      onFilter: (value: any, record: UserAccountItem) => record.isEnabled === value,
      render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 120,
      render: (v: string) => v ? v.substring(0, 10) : '-',
    },
    {
      title: '操作',
      width: 180,
      render: (_: unknown, record: UserAccountItem) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => openEditAcct(record)}>编辑</Button>
          <Popconfirm
            title={record.isEnabled ? '确认停用？' : '确认启用？'}
            onConfirm={async () => {
              try {
                await updateUserAccount(record.id, { isEnabled: !record.isEnabled });
                message.success(record.isEnabled ? '已停用' : '已启用');
                await loadData();
              } catch (e) {
                message.error(getErrorMessage(e, '操作失败'));
              }
            }}
            okText="确认" cancelText="取消"
          >
            <Button type="link" size="small" danger={record.isEnabled}
              style={record.isEnabled ? {} : { color: '#52c41a' }}>
              {record.isEnabled ? '停用' : '启用'}
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认删除此员工账号？"
            onConfirm={() => handleDelete(record)}
            okText="删除" okType="danger" cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>账号权限管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button
            icon={<UsergroupAddOutlined />}
            onClick={openBatchProvision}
            style={{ borderColor: '#52c41a', color: '#52c41a' }}
          >
            批量开通
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateAcct}>新增账号</Button>
        </Space>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'admin',
            label: (
              <span>
                🔑 管理员 <Badge count={adminAccounts.length} style={{ backgroundColor: '#1677ff', marginLeft: 6 }} />
              </span>
            ),
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={adminAccounts}
                columns={adminColumns}
                size="small"
                pagination={false}
              />
            ),
          },
          {
            key: 'employee',
            label: (
              <span>
                👥 员工账号 <Badge count={employeeAccounts.length} style={{ backgroundColor: '#52c41a', marginLeft: 6 }} />
              </span>
            ),
            children: (
              <div>
                {/* 员工操作栏 */}
                {selectedEmployeeAcctIds.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 16px', marginBottom: 12,
                    background: '#fff2f0', borderRadius: 8, border: '1px solid #ffccc7',
                  }}>
                    <Text>已选中 <strong style={{ color: '#ff4d4f' }}>{selectedEmployeeAcctIds.length}</strong> 个账号</Text>
                    <Button
                      size="small" danger icon={<DeleteOutlined />}
                      onClick={handleBatchDelete}
                    >
                      批量删除
                    </Button>
                    <Button size="small" onClick={() => setSelectedEmployeeAcctIds([])}>取消选择</Button>
                  </div>
                )}
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={employeeAccounts}
                  columns={employeeColumns as any}
                  size="small"
                  pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '30', '50'], showTotal: (t) => `共 ${t} 个员工账号` }}
                  rowSelection={{
                    selectedRowKeys: selectedEmployeeAcctIds,
                    onChange: (keys) => setSelectedEmployeeAcctIds(keys as string[]),
                    selections: [Table.SELECTION_ALL, Table.SELECTION_NONE],
                  }}
                />
              </div>
            ),
          },
        ]}
      />

      {/* ── 账号弹窗 ── */}
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

      {/* ── 批量开通弹窗 ── */}
      <Modal
        title={
          <Space><UsergroupAddOutlined style={{ color: '#52c41a' }} /><span>批量开通员工账号</span></Space>
        }
        open={batchModal}
        onCancel={() => { setBatchModal(false); setBatchResult(null); }}
        width={720}
        footer={batchResult ? [
          <Button key="close" type="primary" onClick={() => { setBatchModal(false); setBatchResult(null); loadData(); }}>完成</Button>
        ] : [
          <Button key="cancel" onClick={() => setBatchModal(false)}>取消</Button>,
          <Button
            key="provision"
            type="primary"
            icon={<UsergroupAddOutlined />}
            loading={batchSaving}
            disabled={selectedEmpIds.length === 0}
            onClick={executeBatchProvision}
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            开通选中 ({selectedEmpIds.length}) 人
          </Button>,
        ]}
      >
        {batchResult ? (
          <Alert
            type={batchResult.failed === 0 ? 'success' : 'warning'}
            showIcon
            message={`批量开通完成：成功 ${batchResult.success} 人${batchResult.failed > 0 ? `，失败 ${batchResult.failed} 人` : ''}`}
            description={
              <div>
                <div style={{ marginTop: 8 }}>
                  ✅ 用户名：员工手机号<br />
                  🔑 默认密码：手机号后6位<br />
                  👤 默认角色：员工
                </div>
                {batchResult.errors.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#ff4d4f' }}>失败详情：</div>
                    {batchResult.errors.map((err, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#999' }}>• {err}</div>
                    ))}
                  </div>
                )}
              </div>
            }
          />
        ) : (
          <div>
            <Alert
              type="info"
              showIcon
              message="以下员工尚未开通系统账号"
              description="勾选需要开通的员工，系统将以手机号作为用户名，手机号后6位作为默认密码，自动创建员工角色账号。"
              style={{ marginBottom: 16 }}
            />
            <Spin spinning={batchLoading}>
              <Table
                rowKey="id"
                dataSource={unprovisionedEmps}
                size="small"
                pagination={false}
                scroll={{ y: 360 }}
                rowSelection={{
                  selectedRowKeys: selectedEmpIds,
                  onChange: (keys) => setSelectedEmpIds(keys as string[]),
                  selections: [Table.SELECTION_ALL, Table.SELECTION_NONE],
                }}
                columns={[
                  { title: '工号', dataIndex: 'employeeNo', width: 110 },
                  { title: '姓名', dataIndex: 'fullName', width: 100 },
                  { title: '部门', dataIndex: 'departmentName', width: 100 },
                  {
                    title: '手机号（将作为用户名）',
                    dataIndex: 'mobileNumber',
                    render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
                  },
                  {
                    title: '默认密码',
                    dataIndex: 'mobileNumber',
                    width: 100,
                    render: (v: string) => <Tag color="orange">{v?.slice(-6)}</Tag>,
                  },
                ]}
              />
            </Spin>
          </div>
        )}
      </Modal>
    </div>
  );
}
