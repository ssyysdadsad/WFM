import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Table, Modal, Form, Input, Select, InputNumber, DatePicker,
  TimePicker, Space, Tag, Typography, message, Drawer, Tooltip, Badge,
  Popconfirm, Descriptions, Empty, Spin, Alert,
} from 'antd';
import {
  PlusOutlined, ThunderboltOutlined, CheckOutlined, CloseOutlined,
  SendOutlined, TeamOutlined, ReloadOutlined, EyeOutlined,
  EditOutlined, DeleteOutlined, StopOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { supabase } from '@/app/lib/supabase/client';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import {
  listUrgentShifts, createUrgentShift, updateUrgentShift, deleteUrgentShift,
  findEligibleEmployees, listSignups, approveSignup, sendUrgentShiftNotifications,
} from '@/app/services/urgent-shift.service';
import type {
  UrgentShiftRecord, UrgentShiftSignupRecord, EligibleEmployee, LaborRuleWarning,
} from '@/app/types/urgent-shift';

const SHIFT_TYPES = ['业务需要', '人员调配', '紧急加班'];

const STATUS_COLORS: Record<string, string> = {
  open: 'green',
  closed: 'default',
  cancelled: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  open: '开放中',
  closed: '已关闭',
  cancelled: '已取消',
};
const SIGNUP_STATUS_COLORS: Record<string, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
};
const SIGNUP_STATUS_LABELS: Record<string, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝',
  cancelled: '已取消',
};

type ProjectOption = { id: string; projectName: string };
type SkillOption = { id: string; skillName: string };

export function UrgentShiftPage() {
  const { currentUser } = useCurrentUser();

  const [shifts, setShifts] = useState<UrgentShiftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  // Refs data
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [skills, setSkills] = useState<SkillOption[]>([]);

  // Signup drawer
  const [signupDrawerOpen, setSignupDrawerOpen] = useState(false);
  const [signupShift, setSignupShift] = useState<UrgentShiftRecord | null>(null);
  const [signups, setSignups] = useState<UrgentShiftSignupRecord[]>([]);
  const [signupsLoading, setSignupsLoading] = useState(false);

  // Eligible employees modal
  const [eligibleModalOpen, setEligibleModalOpen] = useState(false);
  const [eligibleShift, setEligibleShift] = useState<UrgentShiftRecord | null>(null);
  const [eligibleEmployees, setEligibleEmployees] = useState<EligibleEmployee[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [sendingNotif, setSendingNotif] = useState(false);

  const loadRefs = useCallback(async () => {
    const [pRes, sRes] = await Promise.all([
      supabase.from('project').select('id, project_name').order('project_name'),
      supabase.from('skill').select('id, skill_name').order('skill_name'),
    ]);
    setProjects((pRes.data || []).map((r: any) => ({ id: r.id, projectName: r.project_name })));
    setSkills((sRes.data || []).map((r: any) => ({ id: r.id, skillName: r.skill_name })));
  }, []);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUrgentShifts();
      setShifts(data);
    } catch (err) {
      message.error(getErrorMessage(err, '加载列表失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRefs(); loadShifts(); }, []);

  /* ===== Create / Edit ===== */
  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      shiftType: '业务需要',
      requiredCount: 1,
      shiftDate: dayjs(),
      signupDeadline: dayjs().add(1, 'day'),
    });
    setModalOpen(true);
  };

  const openEdit = (record: UrgentShiftRecord) => {
    setEditingId(record.id);
    form.setFieldsValue({
      title: record.title,
      shiftType: record.shiftType,
      shiftDate: dayjs(record.shiftDate),
      startTime: record.startTime ? dayjs(record.startTime, 'HH:mm:ss') : undefined,
      endTime: record.endTime ? dayjs(record.endTime, 'HH:mm:ss') : undefined,
      requiredCount: record.requiredCount,
      projectId: record.projectId,
      skillId: record.skillId,
      signupDeadline: record.signupDeadline ? dayjs(record.signupDeadline) : undefined,
      description: record.description,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        title: values.title,
        shiftType: values.shiftType,
        shiftDate: values.shiftDate.format('YYYY-MM-DD'),
        startTime: values.startTime.format('HH:mm'),
        endTime: values.endTime.format('HH:mm'),
        requiredCount: values.requiredCount,
        projectId: values.projectId,
        skillId: values.skillId || null,
        signupDeadline: values.signupDeadline.toISOString(),
        description: values.description || '',
      };

      if (editingId) {
        await updateUrgentShift(editingId, payload);
        message.success('更新成功');
      } else {
        await createUrgentShift(payload, currentUser?.id || '');
        message.success('创建成功');
      }
      setModalOpen(false);
      loadShifts();
    } catch (err: any) {
      if (err?.errorFields) return; // form validation
      message.error(getErrorMessage(err, '保存失败'));
    }
  };

  /* ===== Signups ===== */
  const openSignups = async (record: UrgentShiftRecord) => {
    setSignupShift(record);
    setSignupDrawerOpen(true);
    setSignupsLoading(true);
    try {
      const data = await listSignups(record.id);
      setSignups(data);
    } catch (err) {
      message.error(getErrorMessage(err, '加载报名失败'));
    } finally {
      setSignupsLoading(false);
    }
  };

  const handleApproveSignup = async (signupId: string, action: 'approve' | 'reject') => {
    try {
      await approveSignup(signupId, action, currentUser?.id || '');
      message.success(action === 'approve' ? '已通过' : '已拒绝');
      if (signupShift) {
        const data = await listSignups(signupShift.id);
        setSignups(data);
      }
      loadShifts();
    } catch (err) {
      message.error(getErrorMessage(err, '审批失败'));
    }
  };

  /* ===== Eligible Employees ===== */
  const openEligible = async (record: UrgentShiftRecord) => {
    setEligibleShift(record);
    setEligibleModalOpen(true);
    setEligibleLoading(true);
    setSelectedEmpIds([]);
    try {
      const data = await findEligibleEmployees(
        record.shiftDate, record.startTime, record.endTime, record.skillId,
      );
      setEligibleEmployees(data);
    } catch (err) {
      message.error(getErrorMessage(err, '查询失败'));
    } finally {
      setEligibleLoading(false);
    }
  };

  const handleSendNotifications = async () => {
    if (selectedEmpIds.length === 0) {
      message.warning('请选择要通知的员工');
      return;
    }
    if (!eligibleShift) return;
    setSendingNotif(true);
    try {
      const count = await sendUrgentShiftNotifications(eligibleShift.id, selectedEmpIds);
      message.success(`已向 ${count} 名员工发送通知`);
      setEligibleModalOpen(false);
    } catch (err) {
      message.error(getErrorMessage(err, '发送失败'));
    } finally {
      setSendingNotif(false);
    }
  };

  /* ===== Close / Cancel ===== */
  const handleClose = async (id: string) => {
    try {
      await updateUrgentShift(id, { status: 'closed' });
      message.success('已关闭');
      loadShifts();
    } catch (err) {
      message.error(getErrorMessage(err, '关闭失败'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUrgentShift(id);
      message.success('已删除');
      loadShifts();
    } catch (err) {
      message.error(getErrorMessage(err, '删除失败'));
    }
  };

  /* ===== Table columns ===== */
  const columns = useMemo(() => [
    {
      title: '标题', dataIndex: 'title', width: 200,
      render: (text: string, record: UrgentShiftRecord) => (
        <div>
          <Typography.Text strong>{text}</Typography.Text>
          <div style={{ fontSize: 12, color: '#999' }}>
            <Tag color="blue" style={{ fontSize: 11 }}>{record.shiftType}</Tag>
          </div>
        </div>
      ),
    },
    {
      title: '日期 / 时间', width: 200,
      render: (_: any, record: UrgentShiftRecord) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.shiftDate}</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {record.startTime?.slice(0, 5)} - {record.endTime?.slice(0, 5)}
          </div>
        </div>
      ),
    },
    {
      title: '项目', dataIndex: 'projectName', width: 140,
      render: (v: string) => v || '-',
    },
    {
      title: '技能', dataIndex: 'skillName', width: 100,
      render: (v: string) => v ? <Tag>{v}</Tag> : <span style={{ color: '#ccc' }}>不限</span>,
    },
    {
      title: '名额', width: 180,
      render: (_: any, record: UrgentShiftRecord) => {
        const remaining = record.requiredCount - (record.approvedCount || 0);
        return (
          <div>
            <span>需求 <b>{record.requiredCount}</b> 人</span>
            <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
            <span>报名 <b style={{ color: '#1890ff' }}>{record.signupCount || 0}</b></span>
            <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
            <span>通过 <b style={{ color: '#52c41a' }}>{record.approvedCount || 0}</b></span>
            {remaining > 0 && (
              <span style={{ color: '#ff4d4f', fontSize: 12, marginLeft: 4 }}>
                (缺{remaining})
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: '截止时间', width: 160,
      render: (_: any, record: UrgentShiftRecord) => {
        const isExpired = new Date(record.signupDeadline) < new Date();
        return (
          <span style={{ color: isExpired ? '#ff4d4f' : '#666', fontSize: 13 }}>
            {dayjs(record.signupDeadline).format('MM-DD HH:mm')}
            {isExpired && <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>已截止</Tag>}
          </span>
        );
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag>,
    },
    {
      title: '操作', key: 'action', width: 280,
      render: (_: any, record: UrgentShiftRecord) => (
        <Space size={4} wrap>
          <Tooltip title="查看报名"><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openSignups(record)}>报名({record.signupCount || 0})</Button></Tooltip>
          <Tooltip title="查看符合条件员工"><Button type="link" size="small" icon={<TeamOutlined />} onClick={() => openEligible(record)}>符合员工</Button></Tooltip>
          {record.status === 'open' && (
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
              <Popconfirm title="确定关闭此紧急班次？关闭后不再接受报名。" onConfirm={() => handleClose(record.id)}>
                <Button type="link" size="small" danger icon={<StopOutlined />}>关闭</Button>
              </Popconfirm>
            </>
          )}
          {record.status !== 'open' && (
            <Popconfirm title="确定删除此紧急班次？" onConfirm={() => handleDelete(record.id)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ], []);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThunderboltOutlined style={{ fontSize: 20, color: '#fa8c16' }} />
          <Typography.Title level={4} style={{ margin: 0 }}>紧急班次管理</Typography.Title>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadShifts}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}
            style={{ background: 'linear-gradient(90deg, #fa8c16, #ffa940)' }}>
            新建紧急班次
          </Button>
        </Space>
      </div>

      {/* Info */}
      <Alert
        message="管理员可在此创建紧急临时用工需求，系统自动筛选无排班冲突的员工，支持消息通知和报名审批。审批通过后自动生成排班记录。"
        type="info" showIcon closable style={{ marginBottom: 16 }}
      />

      {/* Table */}
      <Table
        dataSource={shifts} columns={columns}
        rowKey="id" loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />

      {/* Create / Edit Modal */}
      <Modal
        title={editingId ? '编辑紧急班次' : '新建紧急班次'}
        open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={handleSave} width={640} okText="保存"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="如：罗湖项目紧急加班" />
          </Form.Item>
          <Form.Item name="shiftType" label="班次类型" rules={[{ required: true }]}>
            <Select options={SHIFT_TYPES.map(t => ({ label: t, value: t }))} />
          </Form.Item>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="shiftDate" label="排班日期" rules={[{ required: true, message: '请选择日期' }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="startTime" label="开始时间" rules={[{ required: true, message: '请选择' }]}>
              <TimePicker format="HH:mm" minuteStep={15} />
            </Form.Item>
            <Form.Item name="endTime" label="结束时间" rules={[{ required: true, message: '请选择' }]}>
              <TimePicker format="HH:mm" minuteStep={15} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="requiredCount" label="需求人数" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={1} max={50} style={{ width: '100%' }} placeholder="最多50人" />
            </Form.Item>
            <Form.Item name="projectId" label="关联项目" rules={[{ required: true, message: '请选择项目' }]} style={{ flex: 2 }}>
              <Select placeholder="选择项目" showSearch optionFilterProp="label"
                options={projects.map(p => ({ label: p.projectName, value: p.id }))} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item name="skillId" label="推荐技能（可选）" style={{ flex: 1 }}>
              <Select placeholder="不限" allowClear showSearch optionFilterProp="label"
                options={skills.map(s => ({ label: s.skillName, value: s.id }))} />
            </Form.Item>
            <Form.Item name="signupDeadline" label="报名截止时间" rules={[{ required: true, message: '请设置截止时间' }]} style={{ flex: 1 }}>
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="description" label="详细说明">
            <Input.TextArea rows={3} placeholder="可选，输入具体需求说明..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Signup Drawer */}
      <Drawer
        title={
          <div>
            <span>报名列表</span>
            {signupShift && (
              <span style={{ fontSize: 13, color: '#999', marginLeft: 8 }}>
                {signupShift.title} · {signupShift.shiftDate}
              </span>
            )}
          </div>
        }
        open={signupDrawerOpen} onClose={() => setSignupDrawerOpen(false)}
        width={640}
      >
        {signupsLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
        ) : signups.length === 0 ? (
          <Empty description="暂无报名" />
        ) : (
          <Table
            dataSource={signups} rowKey="id" pagination={false} size="small"
            columns={[
              { title: '员工', width: 100, render: (_: any, r: UrgentShiftSignupRecord) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{r.employeeName}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{r.employeeNo}</div>
                </div>
              )},
              { title: '部门', dataIndex: 'departmentName', width: 100 },
              { title: '备注', dataIndex: 'remark', width: 120, render: (v: string) => v || '-' },
              { title: '报名时间', width: 140, render: (_: any, r: UrgentShiftSignupRecord) => dayjs(r.createdAt).format('MM-DD HH:mm') },
              { title: '状态', width: 80, render: (_: any, r: UrgentShiftSignupRecord) => (
                <Tag color={SIGNUP_STATUS_COLORS[r.status]}>{SIGNUP_STATUS_LABELS[r.status]}</Tag>
              )},
              { title: '操作', width: 140, render: (_: any, r: UrgentShiftSignupRecord) => (
                r.status === 'pending' ? (
                  <Space>
                    <Button type="primary" size="small" icon={<CheckOutlined />}
                      onClick={() => handleApproveSignup(r.id, 'approve')}>通过</Button>
                    <Button size="small" danger icon={<CloseOutlined />}
                      onClick={() => handleApproveSignup(r.id, 'reject')}>拒绝</Button>
                  </Space>
                ) : (
                  <span style={{ color: '#999', fontSize: 12 }}>
                    {r.approvalComment || '已处理'}
                  </span>
                )
              )},
            ]}
          />
        )}
      </Drawer>

      {/* Eligible Employees Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TeamOutlined style={{ color: '#52c41a' }} />
            <span>符合条件的员工</span>
            {eligibleShift && (
              <span style={{ fontSize: 13, color: '#999' }}>
                {eligibleShift.shiftDate} {eligibleShift.startTime?.slice(0, 5)}-{eligibleShift.endTime?.slice(0, 5)}
              </span>
            )}
          </div>
        }
        open={eligibleModalOpen}
        onCancel={() => setEligibleModalOpen(false)}
        width={720}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#666' }}>
              已选 <b style={{ color: '#1890ff' }}>{selectedEmpIds.length}</b> 人
              {eligibleShift?.skillName && (
                <span style={{ marginLeft: 8 }}>
                  <InfoCircleOutlined style={{ color: '#fa8c16', marginRight: 4 }} />
                  推荐技能：{eligibleShift.skillName}
                </span>
              )}
            </span>
            <Space>
              <Button onClick={() => setEligibleModalOpen(false)}>取消</Button>
              <Button type="primary" icon={<SendOutlined />}
                loading={sendingNotif}
                onClick={handleSendNotifications}
                disabled={selectedEmpIds.length === 0}>
                发送通知 ({selectedEmpIds.length}人)
              </Button>
            </Space>
          </div>
        }
      >
        {eligibleLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
        ) : eligibleEmployees.length === 0 ? (
          <Empty description="没有找到符合条件的员工（所有员工都有时间冲突）" />
        ) : (
          <>
            <Alert
              message={`共 ${eligibleEmployees.length} 名员工在该时间段无排班冲突，可勾选后一键发送通知。`}
              type="success" showIcon style={{ marginBottom: 12 }}
            />
            <Table
              dataSource={eligibleEmployees} rowKey="employeeId" pagination={false} size="small"
              scroll={{ y: 400 }}
              rowSelection={{
                selectedRowKeys: selectedEmpIds,
                onChange: (keys) => setSelectedEmpIds(keys as string[]),
              }}
              columns={[
                { title: '工号', dataIndex: 'employeeNo', width: 100 },
                { title: '姓名', dataIndex: 'employeeName', width: 100,
                  render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
                },
                { title: '部门', dataIndex: 'departmentName', width: 100 },
                { title: '技能', width: 160, render: (_: any, r: EligibleEmployee) => (
                  r.skills.length > 0
                    ? r.skills.map(s => <Tag key={s} style={{ fontSize: 11 }}>{s}</Tag>)
                    : <span style={{ color: '#ccc' }}>-</span>
                )},
                { title: '当天排班', dataIndex: 'currentShift', width: 100,
                  render: (v: string | null) => {
                    if (!v) return <Tag>无排班</Tag>;
                    if (v === '休') return <Tag color="default">休</Tag>;
                    return <Tag color="blue">{v}</Tag>;
                  },
                },
                { title: '用工规则校验', width: 200,
                  render: (_: any, r: EligibleEmployee) => {
                    const warnings = r.laborWarnings || [];
                    if (warnings.length === 0) {
                      return <Tag color="success">✓ 无警告</Tag>;
                    }
                    const hardWarnings = warnings.filter(w => w.level === 'hard');
                    const softWarnings = warnings.filter(w => w.level === 'soft');
                    return (
                      <div>
                        {hardWarnings.map((w, i) => (
                          <Tooltip key={`h${i}`} title={`[强制] ${w.ruleName}: ${w.message}`}>
                            <Tag color="error" style={{ fontSize: 11, marginBottom: 2, cursor: 'pointer' }}>
                              ⛔ {w.message.length > 16 ? w.message.substring(0, 16) + '...' : w.message}
                            </Tag>
                          </Tooltip>
                        ))}
                        {softWarnings.map((w, i) => (
                          <Tooltip key={`s${i}`} title={`[建议] ${w.ruleName}: ${w.message}`}>
                            <Tag color="warning" style={{ fontSize: 11, marginBottom: 2, cursor: 'pointer' }}>
                              ⚠ {w.message.length > 16 ? w.message.substring(0, 16) + '...' : w.message}
                            </Tag>
                          </Tooltip>
                        ))}
                      </div>
                    );
                  },
                },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
