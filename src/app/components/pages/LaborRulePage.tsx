import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Space, Typography, message, Tag, Switch,
  Modal, Form, Input, InputNumber, Select, Radio, Popconfirm,
  Empty, Tooltip, Divider, Badge,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  ThunderboltOutlined, WarningOutlined, CheckCircleOutlined,
  ClockCircleOutlined, GlobalOutlined, ApartmentOutlined, ProjectOutlined,
  CalendarOutlined, SwapOutlined, TeamOutlined,
} from '@ant-design/icons';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { listProjectOptions, listDepartmentOptions } from '@/app/services/master-data.service';
import { getDictItemsByTypeCode } from '@/app/services/dict.service';
import {
  listLaborRules,
  createLaborRule,
  updateLaborRule,
  deleteLaborRule,
  toggleLaborRule,
  type LaborRule,
  type ApplicableScope,
} from '@/app/services/labor-rule.service';
import type { ReferenceOption } from '@/app/types/master-data';

export function LaborRulePage() {
  const [rules, setRules] = useState<LaborRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<LaborRule | null>(null);
  const [form] = Form.useForm();
  const [projects, setProjects] = useState<ReferenceOption[]>([]);
  const [departments, setDepartments] = useState<ReferenceOption[]>([]);
  const [laborRelationItems, setLaborRelationItems] = useState<{ id: string; itemName: string }[]>([]);
  const [scopeType, setScopeType] = useState<'all' | 'project' | 'department' | 'labor_relation'>('all');

  useEffect(() => {
    loadData();
    loadRefs();
  }, []);

  async function loadRefs() {
    try {
      const [projOpts, deptOpts, lrItems] = await Promise.all([
        listProjectOptions(),
        listDepartmentOptions(),
        getDictItemsByTypeCode('labor_relation_type'),
      ]);
      setProjects(projOpts);
      setDepartments(deptOpts);
      setLaborRelationItems(lrItems.map(i => ({ id: i.id, itemName: i.itemName })));
    } catch (e) {
      // ignore
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const rows = await listLaborRules();
      setRules(rows);
    } catch (error) {
      message.error(getErrorMessage(error, '加载用工规则失败'));
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingRule(null);
    form.resetFields();
    form.setFieldsValue({
      scopeType: 'all',
      isHardConstraint: false,
      priority: 100,
    });
    setScopeType('all');
    setModalOpen(true);
  }

  function openEditModal(rule: LaborRule) {
    setEditingRule(rule);
    const st = rule.applicableScope?.type || 'all';
    setScopeType(st);
    form.setFieldsValue({
      ruleName: rule.ruleName,
      scopeType: st,
      projectIds: rule.applicableScope?.projectIds || [],
      departmentIds: rule.applicableScope?.departmentIds || [],
      laborRelationDictItemIds: rule.applicableScope?.laborRelationDictItemIds || [],
      priority: rule.priority ?? 100,
      dailyHoursLimit: rule.dailyHoursLimit,
      weeklyHoursLimit: rule.weeklyHoursLimit,
      monthlyHoursLimit: rule.monthlyHoursLimit,
      maxConsecutiveWorkDays: rule.maxConsecutiveWorkDays,
      minShiftIntervalHours: rule.minShiftIntervalHours,
      isHardConstraint: rule.isHardConstraint,
      remark: rule.remark,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      const scope: ApplicableScope = {
        type: values.scopeType,
        ...(values.scopeType === 'project' ? { projectIds: values.projectIds || [] } : {}),
        ...(values.scopeType === 'department' ? { departmentIds: values.departmentIds || [] } : {}),
        ...(values.scopeType === 'labor_relation' ? { laborRelationDictItemIds: values.laborRelationDictItemIds || [] } : {}),
      };

      if (editingRule) {
        await updateLaborRule(editingRule.id, {
          ruleName: values.ruleName,
          applicableScope: scope,
          priority: values.priority,
          dailyHoursLimit: values.dailyHoursLimit ?? null,
          weeklyHoursLimit: values.weeklyHoursLimit ?? null,
          monthlyHoursLimit: values.monthlyHoursLimit ?? null,
          maxConsecutiveWorkDays: values.maxConsecutiveWorkDays ?? null,
          minShiftIntervalHours: values.minShiftIntervalHours ?? null,
          isHardConstraint: values.isHardConstraint ?? false,
          remark: values.remark ?? null,
        });
        message.success('更新成功');
      } else {
        await createLaborRule({
          ruleName: values.ruleName,
          applicableScope: scope,
          priority: values.priority,
          dailyHoursLimit: values.dailyHoursLimit ?? null,
          weeklyHoursLimit: values.weeklyHoursLimit ?? null,
          monthlyHoursLimit: values.monthlyHoursLimit ?? null,
          maxConsecutiveWorkDays: values.maxConsecutiveWorkDays ?? null,
          minShiftIntervalHours: values.minShiftIntervalHours ?? null,
          isHardConstraint: values.isHardConstraint ?? false,
          remark: values.remark,
        });
        message.success('创建成功');
      }
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '保存规则失败'));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteLaborRule(id);
      message.success('已删除');
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '删除规则失败'));
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await toggleLaborRule(id, enabled);
      message.success(enabled ? '已启用' : '已禁用');
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '切换规则状态失败'));
    }
  }

  const projMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.label])), [projects]);
  const deptMap = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d.label])), [departments]);
  const lrMap   = useMemo(() => Object.fromEntries(laborRelationItems.map(i => [i.id, i.itemName])), [laborRelationItems]);

  function renderScopeTag(rule: LaborRule) {
    const scope = rule.applicableScope;
    if (!scope || scope.type === 'all') {
      return <Tag icon={<GlobalOutlined />} color="blue">全局</Tag>;
    }
    if (scope.type === 'project') {
      const names = (scope.projectIds || []).map(id => projMap[id] || id.substring(0, 6)).join('、');
      return (
        <Tooltip title={names}>
          <Tag icon={<ProjectOutlined />} color="cyan">
            项目：{names.length > 12 ? names.substring(0, 12) + '...' : names}
          </Tag>
        </Tooltip>
      );
    }
    if (scope.type === 'department') {
      const names = (scope.departmentIds || []).map(id => deptMap[id] || id.substring(0, 6)).join('、');
      return (
        <Tooltip title={names}>
          <Tag icon={<ApartmentOutlined />} color="purple">
            部门：{names.length > 12 ? names.substring(0, 12) + '...' : names}
          </Tag>
        </Tooltip>
      );
    }
    if (scope.type === 'labor_relation') {
      const names = (scope.laborRelationDictItemIds || []).map(id => lrMap[id] || id.substring(0, 6)).join('、');
      return (
        <Tooltip title={names}>
          <Tag icon={<TeamOutlined />} color="green">
            劳务关系：{names.length > 12 ? names.substring(0, 12) + '...' : names}
          </Tag>
        </Tooltip>
      );
    }
    return null;
  }

  function renderConstraintBadge(rule: LaborRule) {
    if (rule.isHardConstraint) {
      return <Tag icon={<ThunderboltOutlined />} color="red">硬约束 · 阻止</Tag>;
    }
    return <Tag icon={<WarningOutlined />} color="orange">软约束 · 预警</Tag>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>用工规则</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            配置排班校验规则，违规排班将在排班矩阵、导入、调班审批中被检测
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新建规则</Button>
        </Space>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>}

      {!loading && rules.length === 0 && (
        <Card>
          <Empty description="暂无用工规则" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              创建第一条规则
            </Button>
          </Empty>
        </Card>
      )}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map(rule => (
            <Card
              key={rule.id}
              size="small"
              style={{
                borderLeft: rule.isEnabled
                  ? (rule.isHardConstraint ? '4px solid #ff4d4f' : '4px solid #faad14')
                  : '4px solid #d9d9d9',
                background: rule.isEnabled
                  ? (rule.isHardConstraint ? '#fff1f0' : '#fffbe6')
                  : undefined,
                opacity: rule.isEnabled ? 1 : 0.6,
                transition: 'all 0.2s',
              }}
              hoverable
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                {/* Left: Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Typography.Text strong style={{ fontSize: 15 }}>
                      {rule.ruleName}
                    </Typography.Text>
                    {renderConstraintBadge(rule)}
                    {renderScopeTag(rule)}
                    <Tag color="default" style={{ fontSize: 11 }}>
                      优先级 {rule.priority ?? '-'}
                    </Tag>
                    {!rule.isEnabled && <Tag color="default">已禁用</Tag>}
                  </div>

                  {/* Limit values */}
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {rule.dailyHoursLimit != null && (
                      <Tooltip title="员工每天的总工作时长不得超过此限额">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
                          <ClockCircleOutlined style={{ color: '#1890ff', fontSize: 13 }} />
                          <Typography.Text style={{ fontSize: 13 }}>
                            日工时上限 <b>{rule.dailyHoursLimit}h</b>
                          </Typography.Text>
                        </div>
                      </Tooltip>
                    )}
                    {rule.weeklyHoursLimit != null && (
                      <Tooltip title="员工每周（周一至周日）的总工作时长不得超过此限额">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
                          <ClockCircleOutlined style={{ color: '#52c41a', fontSize: 13 }} />
                          <Typography.Text style={{ fontSize: 13 }}>
                            周工时上限 <b>{rule.weeklyHoursLimit}h</b>
                          </Typography.Text>
                        </div>
                      </Tooltip>
                    )}
                    {rule.maxConsecutiveWorkDays != null && (
                      <Tooltip title="员工最多连续工作的天数，超过后必须安排休息">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
                          <CheckCircleOutlined style={{ color: '#fa8c16', fontSize: 13 }} />
                          <Typography.Text style={{ fontSize: 13 }}>
                            连续工作上限 <b>{rule.maxConsecutiveWorkDays}天</b>
                          </Typography.Text>
                        </div>
                      </Tooltip>
                    )}
                    {rule.monthlyHoursLimit != null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CalendarOutlined style={{ color: '#722ed1', fontSize: 13 }} />
                        <Typography.Text style={{ fontSize: 13 }}>
                          月工时上限 <b>{rule.monthlyHoursLimit}h</b>
                        </Typography.Text>
                      </div>
                    )}
                    {rule.minShiftIntervalHours != null && (
                      <Tooltip title="两次上班之间至少休息的小时数，确保充分休息">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
                          <SwapOutlined style={{ color: '#eb2f96', fontSize: 13 }} />
                          <Typography.Text style={{ fontSize: 13 }}>
                            班次间隔≥ <b>{rule.minShiftIntervalHours}h</b>
                          </Typography.Text>
                        </div>
                      </Tooltip>
                    )}
                    {rule.dailyHoursLimit == null && rule.weeklyHoursLimit == null && rule.monthlyHoursLimit == null && rule.maxConsecutiveWorkDays == null && rule.minShiftIntervalHours == null && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        未设置任何限额
                      </Typography.Text>
                    )}
                  </div>

                  {rule.remark && (
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                      {rule.remark}
                    </Typography.Text>
                  )}
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <Tooltip title={rule.isEnabled ? '禁用' : '启用'}>
                    <Switch
                      size="small"
                      checked={rule.isEnabled}
                      onChange={(checked) => handleToggle(rule.id, checked)}
                    />
                  </Tooltip>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEditModal(rule)}
                  />
                  <Popconfirm
                    title="确认删除此规则？"
                    onConfirm={() => handleDelete(rule.id)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        title={editingRule ? '编辑用工规则' : '新建用工规则'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="ruleName" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="例如：标准工时规则" />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }}>约束限额</Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="dailyHoursLimit" label="日工时上限(h)">
              <InputNumber min={0} max={24} step={0.5} style={{ width: '100%' }} placeholder="如 10" />
            </Form.Item>
            <Form.Item name="weeklyHoursLimit" label="周工时上限(h)">
              <InputNumber min={0} max={168} step={1} style={{ width: '100%' }} placeholder="如 44" />
            </Form.Item>
            <Form.Item name="monthlyHoursLimit" label="月工时上限(h)">
              <InputNumber min={0} max={744} step={1} style={{ width: '100%' }} placeholder="如 176" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="maxConsecutiveWorkDays" label="连续工作天数">
              <InputNumber min={0} max={31} step={1} style={{ width: '100%' }} placeholder="如 6" />
            </Form.Item>
            <Form.Item name="minShiftIntervalHours" label="班次间隔下限(h)" tooltip="上一班下班到下一班上班的最小时间间隔">
              <InputNumber min={0} max={48} step={0.5} style={{ width: '100%' }} placeholder="如 11" />
            </Form.Item>
          </div>

          <Divider style={{ margin: '12px 0' }}>约束类型与范围</Divider>

          <Form.Item name="isHardConstraint" label="约束类型">
            <Radio.Group>
              <Radio.Button value={false}>
                <WarningOutlined style={{ color: '#faad14' }} /> 软约束（预警）
              </Radio.Button>
              <Radio.Button value={true}>
                <ThunderboltOutlined style={{ color: '#ff4d4f' }} /> 硬约束（阻止）
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item name="scopeType" label="适用范围">
            <Radio.Group onChange={e => setScopeType(e.target.value)}>
              <Radio.Button value="all"><GlobalOutlined /> 全局</Radio.Button>
              <Radio.Button value="project"><ProjectOutlined /> 按项目</Radio.Button>
              <Radio.Button value="department"><ApartmentOutlined /> 按部门</Radio.Button>
              <Radio.Button value="labor_relation"><TeamOutlined /> 按劳务关系</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {scopeType === 'project' && (
            <Form.Item name="projectIds" label="选择项目" rules={[{ required: true, message: '请至少选择一个项目' }]}>
              <Select
                mode="multiple"
                placeholder="选择适用的项目"
                options={projects.map(p => ({ label: p.label, value: p.id }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}

          {scopeType === 'department' && (
            <Form.Item name="departmentIds" label="选择部门" rules={[{ required: true, message: '请至少选择一个部门' }]}>
              <Select
                mode="multiple"
                placeholder="选择适用的部门"
                options={departments.map(d => ({ label: d.label, value: d.id }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}

          {scopeType === 'labor_relation' && (
            <Form.Item name="laborRelationDictItemIds" label="选择劳务关系类型" rules={[{ required: true, message: '请至少选择一种劳务关系' }]}>
              <Select
                mode="multiple"
                placeholder="选择适用的劳务关系类型"
                options={laborRelationItems.map(i => ({ label: i.itemName, value: i.id }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}

          <Form.Item name="priority" label="优先级" tooltip="数值越小优先级越高，多条规则匹配时取优先级最高的">
            <InputNumber min={1} max={999} style={{ width: 120 }} />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="规则说明..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
