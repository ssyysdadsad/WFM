import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Table, Button, Space, Typography, message, Tag, Modal, Input, Descriptions, Badge, Select, Card, Divider, Empty, Spin, Tooltip, Alert } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined, ExpandOutlined, FilterOutlined, SwapOutlined, UserSwitchOutlined, SearchOutlined, CalendarOutlined, WarningOutlined, ScheduleOutlined } from '@ant-design/icons';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { approveShiftChange, listShiftChangeRequests, loadShiftChangeReferences, getMonthlyHoursImpact, type HoursImpact } from '@/app/services/shift-change.service';
import { validateShiftChange, type ValidationResult, type ScheduleViolation } from '@/app/services/labor-rule.service';
import type { ApprovalStatusOption, ShiftChangeRequestRecord, AvailableReplacement } from '@/app/types/shift-change';

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

export function ShiftChangePage() {
  const navigate = useNavigate();
  const { currentUser } = useCurrentUser();
  const [data, setData] = useState<ShiftChangeRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusItems, setStatusItems] = useState<ApprovalStatusOption[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('pending');
  const [detailRecord, setDetailRecord] = useState<ShiftChangeRequestRecord | null>(null);

  const [approvalComment, setApprovalComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  // Hours impact preview
  const [hoursImpact, setHoursImpact] = useState<{ applicant: HoursImpact; replacement: HoursImpact } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  // 用工规则预检查结果
  const [laborWarningsMap, setLaborWarningsMap] = useState<Record<string, { hard: ScheduleViolation[]; soft: ScheduleViolation[] }>>({}); 

  // Schedule preview for detail modal
  const [schedulePreview, setSchedulePreview] = useState<{ date: string; codeName: string; category: string; hours: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => { loadData(); loadRefs(); }, []);

  async function loadRefs() {
    try {
      const refs = await loadShiftChangeReferences();
      setStatusItems(refs.statuses);
    } catch (error) {
      message.error(getErrorMessage(error, '加载调班审批基础数据失败'));
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const rows = await listShiftChangeRequests();
      setData(rows);
      // 异步预检查待审批记录的用工规则
      runLaborRulePreCheck(rows);
    } catch (error) {
      message.error(getErrorMessage(error, '加载调班申请失败'));
    } finally {
      setLoading(false);
    }
  }

  /** 对所有待审批的记录运行用工规则校验，结果存入 map 供列表展示 */
  async function runLaborRulePreCheck(rows: ShiftChangeRequestRecord[]) {
    const pending = rows.filter(
      r => r.statusCode?.includes('pending') && !r.approvedAt && r.originalScheduleDate && r.scheduleVersionId,
    );
    if (pending.length === 0) return;

    const map: Record<string, { hard: ScheduleViolation[]; soft: ScheduleViolation[] }> = {};
    await Promise.all(
      pending.map(async (record) => {
        try {
          const shiftHours = record.originalPlannedHours ?? 8;
          // 校验申请人
          const applicantResult = await validateShiftChange({
            employeeId: record.applicantEmployeeId,
            employeeName: record.applicantName || '申请人',
            changeDate: record.originalScheduleDate!,
            newPlannedHours: 0,
            newIsWorkDay: false,
            scheduleVersionId: record.scheduleVersionId!,
            projectId: record.projectId || undefined,
            departmentId: record.applicantDepartmentId || undefined,
            laborRelationDictItemId: record.applicantLaborRelationDictItemId || undefined,
          });
          // 校验互换对象（swap）或替班人（direct_change 尚未选人，跳过）
          let targetResult: ValidationResult | null = null;
          if (record.requestType === 'swap' && record.targetEmployeeId) {
            targetResult = await validateShiftChange({
              employeeId: record.targetEmployeeId,
              employeeName: record.targetEmployeeName || '互换对象',
              changeDate: record.originalScheduleDate!,
              newPlannedHours: shiftHours,
              newIsWorkDay: true,
              scheduleVersionId: record.scheduleVersionId!,
              projectId: record.projectId || undefined,
              departmentId: record.applicantDepartmentId || undefined,
              laborRelationDictItemId: record.applicantLaborRelationDictItemId || undefined,
            });
          }
          const hard = [...applicantResult.hardViolations, ...(targetResult?.hardViolations || [])];
          const soft = [...applicantResult.softViolations, ...(targetResult?.softViolations || [])];
          if (hard.length > 0 || soft.length > 0) {
            map[record.id] = { hard, soft };
          }
        } catch { /* ignore individual failures */ }
      }),
    );
    setLaborWarningsMap(map);
  }

  // Open detail modal
  function openDetail(record: ShiftChangeRequestRecord) {
    setDetailRecord(record);
    setApprovalComment('');
    setHoursImpact(null);
    setSchedulePreview([]);
    // Load schedule preview
    if (record.applicantEmployeeId && record.scheduleVersionId && record.originalScheduleDate) {
      loadSchedulePreview(record.applicantEmployeeId, record.scheduleVersionId, record.originalScheduleDate);
    }
  }

  async function loadSchedulePreview(empId: string, versionId: string, centerDate: string) {
    setPreviewLoading(true);
    try {
      const { supabase } = await import('@/app/lib/supabase/client');
      const d = new Date(centerDate);
      const start = new Date(d); start.setDate(d.getDate() - 7);
      const end = new Date(d); end.setDate(d.getDate() + 7);

      const { data: schedules } = await supabase
        .from('schedule')
        .select('schedule_date, planned_hours, schedule_code_dict_item_id')
        .eq('employee_id', empId)
        .eq('schedule_version_id', versionId)
        .gte('schedule_date', start.toISOString().split('T')[0])
        .lte('schedule_date', end.toISOString().split('T')[0])
        .order('schedule_date');

      const { data: dictItems } = await supabase.from('dict_item').select('id, item_name, extra_config');
      const dictMap = new Map((dictItems || []).map((d: any) => [d.id, d]));

      setSchedulePreview(
        (schedules || []).map((s: any) => {
          const dictItem = dictMap.get(s.schedule_code_dict_item_id);
          return {
            date: s.schedule_date,
            codeName: dictItem?.item_name || '-',
            category: dictItem?.extra_config?.category || 'work',
            hours: Number(s.planned_hours || 0),
          };
        })
      );
    } catch {
      setSchedulePreview([]);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApproval(record: ShiftChangeRequestRecord, approved: boolean) {
    if (!currentUser?.id) {
      message.warning('当前未登录，无法执行审批');
      return;
    }

    // Peer status check
    if (approved && record.peerStatus !== 'peer_approved' && record.peerStatus !== 'not_required') {
      message.warning('对方尚未确认，无法通过审批');
      return;
    }

    // Labor rule validation before approval
    if (approved && record.originalScheduleDate && record.scheduleVersionId) {
      try {
        // Dual validation: check BOTH employees
        const shiftHours = record.originalPlannedHours ?? 8;
        const applicantValidation = await validateShiftChange({
          employeeId: record.applicantEmployeeId,
          employeeName: record.applicantName || '申请人',
          changeDate: record.originalScheduleDate,
          newPlannedHours: 0, // applicant goes from work to rest
          newIsWorkDay: false,
          scheduleVersionId: record.scheduleVersionId,
          projectId: record.projectId,
          departmentId: record.applicantDepartmentId || undefined,
          laborRelationDictItemId: record.applicantLaborRelationDictItemId || undefined,
        });

        // Validate target employee (gaining hours) if applicable
        const replacementEmpId = record.targetEmployeeId || record.applicantEmployeeId;
        const replacementName = record.targetEmployeeName || record.applicantName || '申请人';
        const replacementValidation = await validateShiftChange({
          employeeId: replacementEmpId,
          employeeName: replacementName,
          changeDate: record.originalScheduleDate,
          newPlannedHours: shiftHours,
          newIsWorkDay: true,
          scheduleVersionId: record.scheduleVersionId,
          projectId: record.projectId,
          departmentId: record.applicantDepartmentId || undefined,
          laborRelationDictItemId: record.applicantLaborRelationDictItemId || undefined,
        });

        // Merge violations from both validations
        const allHardViolations = [...applicantValidation.hardViolations, ...replacementValidation.hardViolations];
        const allSoftViolations = [...applicantValidation.softViolations, ...replacementValidation.softViolations];

        const result = {
          passed: allHardViolations.length === 0,
          hardViolations: allHardViolations,
          softViolations: allSoftViolations,
        };
        if (result.hardViolations.length > 0) {
          Modal.error({
            title: '用工规则硬约束违规',
            content: (
              <div>
                <Alert type="error" showIcon message="存在硬约束违规，无法通过审批" style={{ marginBottom: 8 }} />
                {result.hardViolations.map((v, i) => (
                  <div key={i} style={{ padding: '6px 12px', marginBottom: 4, background: '#fff2f0', borderRadius: 6, borderLeft: '3px solid #ff4d4f', fontSize: 13 }}>
                    {v.message}
                  </div>
                ))}
              </div>
            ),
          });
          return;
        }
        if (result.softViolations.length > 0) {
          const confirmed = await new Promise<boolean>(resolve => {
            Modal.confirm({
              title: '用工规则预警',
              icon: <WarningOutlined style={{ color: '#faad14' }} />,
              content: (
                <div>
                  <Alert type="warning" showIcon message="存在软约束风险，是否继续审批通过？" style={{ marginBottom: 8 }} />
                  {result.softViolations.map((v, i) => (
                    <div key={i} style={{ padding: '6px 12px', marginBottom: 4, background: '#fffbe6', borderRadius: 6, borderLeft: '3px solid #faad14', fontSize: 13 }}>
                      {v.message}
                    </div>
                  ))}
                </div>
              ),
              okText: '确认通过',
              cancelText: '取消',
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });
          if (!confirmed) return;
        }
      } catch {
        // Validation failed silently, proceed with approval
      }
    }

    setSubmitting(true);
    try {
      await approveShiftChange({
        shiftChangeRequestId: record.id,
        action: approved ? 'approve' : 'reject',
        approvalComment: approvalComment || undefined,
        operatorUserAccountId: currentUser.id,
      });
      message.success(approved ? '审批通过，排班已更新' : '已拒绝');
      setDetailRecord(null);
      await loadData();
    } catch (error) {
      message.error(getErrorMessage(error, '审批调班失败'));
    } finally {
      setSubmitting(false);
    }
  }

  // Quick approve for swap (no replacement needed)
  function handleQuickApproval(record: ShiftChangeRequestRecord, approved: boolean) {
    // 校验：互换调班时两人班次相同无意义（如"休"换"休"）
    if (approved && record.requestType === 'swap' && record.originalCodeName && record.targetCodeName
        && record.originalCodeName === record.targetCodeName) {
      Modal.warning({
        title: '互换无意义',
        content: (
          <div>
            <Alert
              type="warning" showIcon
              message={`${record.applicantName} 和 ${record.targetEmployeeName} 当天班次均为「${record.originalCodeName}」，互换后无任何变化。`}
              description="建议拒绝此申请，或要求员工选择不同班次的同事进行互换。"
              style={{ marginBottom: 12 }}
            />
          </div>
        ),
        okText: '知道了',
      });
      return;
    }

    Modal.confirm({
      title: approved ? '确认通过' : '确认拒绝',
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>{`确定${approved ? '通过' : '拒绝'}此${record.requestType === 'swap' ? '互换调班' : '调班'}申请？`}</span>
          {record.requestType === 'swap' && approved && (
            <div style={{ background: '#f6ffed', padding: 12, borderRadius: 8, border: '1px solid #b7eb8f' }}>
              <div><strong>{record.applicantName}</strong> 的 {record.originalCodeName} ↔ <strong>{record.targetEmployeeName}</strong> 的 {record.targetCodeName || '班次'} 将互换</div>
            </div>
          )}
          <Input.TextArea
            id="shift-change-quick-comment"
            rows={2}
            placeholder="审批意见（选填）"
          />
        </Space>
      ),
      onOk: async () => {
        if (!currentUser?.id) {
          message.warning('当前未登录');
          return;
        }
        const commentEl = document.getElementById('shift-change-quick-comment') as HTMLTextAreaElement | null;
        try {
          await approveShiftChange({
            shiftChangeRequestId: record.id,
            action: approved ? 'approve' : 'reject',
            approvalComment: commentEl?.value || undefined,
            operatorUserAccountId: currentUser.id,
          });
          message.success('操作成功');
          await loadData();
        } catch (error) {
          message.error(getErrorMessage(error, '审批调班失败'));
        }
      },
    });
  }

  // Batch approval handler
  async function handleBatchApproval(approved: boolean) {
    if (!currentUser?.id || selectedRowKeys.length === 0) return;
    const pendingRecords = data.filter(r =>
      selectedRowKeys.includes(r.id) && !r.approvedAt && r.statusCode?.includes('pending')
    );
    if (pendingRecords.length === 0) {
      message.info('没有可审批的记录');
      return;
    }
    // Only batch approve swap type (direct_change needs replacement)
    const swapRecords = pendingRecords.filter(r => r.requestType === 'swap');
    const directRecords = pendingRecords.filter(r => r.requestType === 'direct_change');
    if (directRecords.length > 0 && swapRecords.length === 0) {
      message.warning('直接变更类型需要逐一指定替班人员，无法批量操作');
      return;
    }

    setBatchSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    for (const record of swapRecords) {
      try {
        await approveShiftChange({
          shiftChangeRequestId: record.id,
          action: approved ? 'approve' : 'reject',
          approvalComment: approved ? '批量通过' : '批量拒绝',
          operatorUserAccountId: currentUser.id,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }
    setBatchSubmitting(false);
    setSelectedRowKeys([]);
    message.success(`批量${approved ? '通过' : '拒绝'}完成：成功 ${successCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ''}${directRecords.length > 0 ? `，${directRecords.length} 条直接变更需单独处理` : ''}`);
    await loadData();
  }

  // Filter data
  const filteredData = data.filter(record => {
    if (activeFilter === 'all') return true;
    const code = record.statusCode || '';
    if (activeFilter === 'pending') return !record.approvedAt && code.includes('pending');
    if (activeFilter === 'approved') return code.includes('approved');
    if (activeFilter === 'rejected') return code.includes('rejected');
    return true;
  });

  const pendingCount = data.filter(r => !r.approvedAt && r.statusCode?.includes('pending')).length;
  const approvedCount = data.filter(r => r.statusCode?.includes('approved')).length;
  const rejectedCount = data.filter(r => r.statusCode?.includes('rejected')).length;

  const FILTER_TABS: { key: FilterTab; label: string; count: number; color: string }[] = [
    { key: 'all', label: '全部', count: data.length, color: '#1677ff' },
    { key: 'pending', label: '待审批', count: pendingCount, color: '#fa8c16' },
    { key: 'approved', label: '已通过', count: approvedCount, color: '#52c41a' },
    { key: 'rejected', label: '已拒绝', count: rejectedCount, color: '#ff4d4f' },
  ];

  const isPending = detailRecord && !detailRecord.approvedAt && detailRecord.statusCode?.includes('pending');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>调班审批</Typography.Title>
        <Space>
          {selectedRowKeys.length > 0 && (
            <>
              <Typography.Text type="secondary">已选 {selectedRowKeys.length} 条</Typography.Text>
              <Button
                type="primary" size="small"
                icon={<CheckOutlined />}
                loading={batchSubmitting}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                onClick={() => handleBatchApproval(true)}
              >批量通过</Button>
              <Button
                danger size="small"
                icon={<CloseOutlined />}
                loading={batchSubmitting}
                onClick={() => handleBatchApproval(false)}
              >批量拒绝</Button>
            </>
          )}
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, padding: '4px',
        background: '#f5f5f5', borderRadius: 10, width: 'fit-content',
      }}>
        {FILTER_TABS.map(tab => (
          <div
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            style={{
              padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
              fontSize: 13, fontWeight: activeFilter === tab.key ? 600 : 400,
              background: activeFilter === tab.key ? '#fff' : 'transparent',
              color: activeFilter === tab.key ? tab.color : '#666',
              boxShadow: activeFilter === tab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <FilterOutlined style={{ fontSize: 11, display: activeFilter === tab.key ? 'inline' : 'none' }} />
            {tab.label}
            <Badge
              count={tab.count}
              style={{
                backgroundColor: activeFilter === tab.key ? tab.color : '#d9d9d9',
                fontSize: 11,
                height: 18, minWidth: 18, lineHeight: '18px',
              }}
            />
          </div>
        ))}
      </div>

      <Table rowKey="id" loading={loading} dataSource={filteredData} size="small"
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          getCheckboxProps: (record: ShiftChangeRequestRecord) => ({
            disabled: !!record.approvedAt || !record.statusCode?.includes('pending'),
          }),
        }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: total => `共 ${total} 条` }}
        columns={[
          {
            title: '调班类型', dataIndex: 'requestType', width: 120,
            render: (value: string, record: ShiftChangeRequestRecord) => {
              const isSameShift = value === 'swap' && record.originalCodeName && record.targetCodeName
                && record.originalCodeName === record.targetCodeName;
              return (
                <Space size={4}>
                  <Tag
                    icon={value === 'swap' ? <SwapOutlined /> : <UserSwitchOutlined />}
                    color={value === 'swap' ? 'blue' : 'orange'}
                  >
                    {value === 'swap' ? '换班' : '请假'}
                  </Tag>
                  {isSameShift && (
                    <Tooltip title={`两人班次均为「${record.originalCodeName}」，互换无意义`}>
                      <WarningOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />
                    </Tooltip>
                  )}
                </Space>
              );
            },
          },
          {
            title: '申请人', width: 120,
            render: (_: unknown, record: ShiftChangeRequestRecord) => (
              <div>
                <div style={{ fontWeight: 500 }}>{record.applicantName}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{record.applicantDeptName}</div>
              </div>
            ),
          },
          {
            title: '所属项目', width: 160,
            render: (_: unknown, record: ShiftChangeRequestRecord) => {
              const dateRange = record.projectStartDate && record.projectEndDate
                ? `${record.projectStartDate.substring(5)} ~ ${record.projectEndDate.substring(5)}`
                : '';
              return (
                <div>
                  <div style={{ fontWeight: 500 }}>{record.projectName || '-'}</div>
                  {dateRange && <div style={{ fontSize: 11, color: '#999' }}>{dateRange}</div>}
                </div>
              );
            },
          },
          {
            title: '原班次', width: 140,
            render: (_: unknown, record: ShiftChangeRequestRecord) => (
              <div>
                <div>{record.originalScheduleDate || '-'}</div>
                <Tag>{record.originalCodeName || '-'}</Tag>
              </div>
            ),
          },
          {
            title: '变更内容', width: 160,
            render: (_: unknown, record: ShiftChangeRequestRecord) => {
              if (record.requestType === 'swap') {
                return (
                  <div>
                    <div style={{ fontSize: 12, color: '#999' }}>互换对象</div>
                    <div style={{ fontWeight: 500 }}>{record.targetEmployeeName || '-'}</div>
                  </div>
                );
              }
              // take_off
              return (
                <div>
                  <div style={{ fontSize: 12, color: '#999' }}>请假{record.targetEmployeeName ? `(替班:${record.targetEmployeeName})` : '(直接休)'}</div>
                  {record.paybackDate && <Tag color="cyan">还班:{record.paybackDate}</Tag>}
                </div>
              );
            },
          },
          {
            title: '对方确认', width: 100,
            render: (_: unknown, record: ShiftChangeRequestRecord) => {
              const map: Record<string, { color: string; label: string }> = {
                pending_peer: { color: 'gold', label: '待确认' },
                peer_approved: { color: 'green', label: '已同意' },
                peer_rejected: { color: 'red', label: '已拒绝' },
                not_required: { color: 'default', label: '无需' },
              };
              const s = map[record.peerStatus] || map.not_required;
              return <Tag color={s.color}>{s.label}</Tag>;
            },
          },
          {
            title: '用工规则', width: 180,
            render: (_: unknown, record: ShiftChangeRequestRecord) => {
              if (!record.statusCode?.includes('pending') || record.approvedAt) {
                return <Typography.Text type="secondary" style={{ fontSize: 12 }}>-</Typography.Text>;
              }
              const warnings = laborWarningsMap[record.id];
              if (!warnings) {
                return <Tag color="success" style={{ fontSize: 11 }}>✓ 无警告</Tag>;
              }
              return (
                <div>
                  {warnings.hard.map((w, i) => (
                    <Tooltip key={`h${i}`} title={`[强制] ${w.ruleName}: ${w.message}`}>
                      <Tag color="error" style={{ fontSize: 11, marginBottom: 2, cursor: 'pointer' }}>
                        ⛔ {w.message.length > 14 ? w.message.substring(0, 14) + '...' : w.message}
                      </Tag>
                    </Tooltip>
                  ))}
                  {warnings.soft.map((w, i) => (
                    <Tooltip key={`s${i}`} title={`[建议] ${w.ruleName}: ${w.message}`}>
                      <Tag color="warning" style={{ fontSize: 11, marginBottom: 2, cursor: 'pointer' }}>
                        ⚠ {w.message.length > 14 ? w.message.substring(0, 14) + '...' : w.message}
                      </Tag>
                    </Tooltip>
                  ))}
                </div>
              );
            },
          },
          {
            title: '操作', key: 'action', width: 260, fixed: 'right' as const,
            render: (_: unknown, record: ShiftChangeRequestRecord) => (
              <Space size={0}>
                <Button type="link" size="small" icon={<ExpandOutlined />} onClick={() => openDetail(record)}>
                  详情
                </Button>
                {record.projectId && record.scheduleVersionId && (
                  <Tooltip title="查看该月排班表">
                    <Button type="link" size="small" icon={<CalendarOutlined />}
                      onClick={() => navigate(`/schedule?projectId=${record.projectId}&versionId=${record.scheduleVersionId}`)}>
                      排班
                    </Button>
                  </Tooltip>
                )}
                {!record.approvedAt && record.statusCode?.includes('pending') ? (
                  record.peerStatus === 'peer_approved' || record.peerStatus === 'not_required' ? (
                    <>
                      <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }}
                        onClick={() => handleQuickApproval(record, true)}>通过</Button>
                      <Button type="link" size="small" icon={<CloseOutlined />} danger
                        onClick={() => handleQuickApproval(record, false)}>拒绝</Button>
                    </>
                  ) : (
                    <Tag color="gold">待对方确认</Tag>
                  )
                ) : (
                  <Typography.Text type="secondary">已处理</Typography.Text>
                )}
              </Space>
            ),
          },
        ]}
        scroll={{ x: 1200 }}
      />

      {/* Detail & Approval Modal */}
      <Modal
        title={null}
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        width={720}
        footer={isPending ? (
          <Space>
            <Button onClick={() => setDetailRecord(null)}>取消</Button>
            <Button danger icon={<CloseOutlined />} loading={submitting}
              onClick={() => detailRecord && handleApproval(detailRecord, false)}>
              拒绝
            </Button>
            <Button type="primary" icon={<CheckOutlined />} loading={submitting}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => detailRecord && handleApproval(detailRecord, true)}
              disabled={detailRecord?.peerStatus !== 'peer_approved' && detailRecord?.peerStatus !== 'not_required'}
            >
              通过
            </Button>
          </Space>
        ) : (
          <Button onClick={() => setDetailRecord(null)}>关闭</Button>
        )}
      >
        {detailRecord && (
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Tag
                icon={detailRecord.requestType === 'direct_swap' || detailRecord.requestType === 'swap' ? <SwapOutlined /> : <UserSwitchOutlined />}
                color={
                  detailRecord.requestType === 'direct_swap' ? 'blue' :
                  detailRecord.requestType === 'swap_with_payback' ? 'purple' :
                  detailRecord.requestType === 'swap' ? 'blue' :
                  detailRecord.requestType === 'leave' ? 'green' : 'orange'
                }
                style={{ fontSize: 14, padding: '4px 12px' }}
              >
                {detailRecord.requestType === 'direct_swap' ? '直接换班' :
                 detailRecord.requestType === 'swap_with_payback' ? '互换调班' :
                 detailRecord.requestType === 'swap' ? '换班' :
                 detailRecord.requestType === 'leave' ? '请假' : '请假'}
              </Tag>
              {(() => {
                const color = detailRecord.statusCode?.includes('approved') ? 'green'
                  : detailRecord.statusCode?.includes('rejected') ? 'red' : 'orange';
                return <Tag color={color} style={{ fontSize: 14, padding: '4px 12px' }}>{detailRecord.statusName}</Tag>;
              })()}
              <div style={{ marginLeft: 'auto', fontSize: 13, color: '#999' }}>
                申请时间: {detailRecord.createdAt?.substring(0, 16).replace('T', ' ') || '-'}
              </div>
            </div>

            {/* Applicant Info */}
            <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 20, background: '#1677ff',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 600,
                }}>
                  {detailRecord.applicantName?.charAt(0) || '?'}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{detailRecord.applicantName}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>{detailRecord.applicantDeptName}</div>
                </div>
                <Divider type="vertical" style={{ height: 30 }} />
                <div>
                  <div style={{ fontSize: 12, color: '#999' }}>原班次</div>
                  <div style={{ fontWeight: 500 }}>
                    {detailRecord.originalScheduleDate} · <Tag>{detailRecord.originalCodeName || '-'}</Tag>
                  </div>
                </div>
              </div>
            </Card>

            {/* Schedule Preview Timeline */}
            {(schedulePreview.length > 0 || previewLoading) && (
              <Card size="small" title={<span><ScheduleOutlined style={{ marginRight: 6 }} />近期排班预览</span>} style={{ marginBottom: 16 }}>
                {previewLoading ? (
                  <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
                ) : (
                  <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '8px 0' }}>
                    {schedulePreview.map((s) => {
                      const isTarget = s.date === detailRecord.originalScheduleDate;
                      const bgColor = isTarget ? '#fff7e6' : s.category === 'work' ? '#f0fdf4' : s.category === 'leave' ? '#fef3cd' : '#f0f5ff';
                      const borderColor = isTarget ? '#fa8c16' : 'transparent';
                      const dayLabel = ['日', '一', '二', '三', '四', '五', '六'][new Date(s.date).getDay()];
                      return (
                        <div key={s.date} style={{
                          minWidth: 60, textAlign: 'center', padding: '6px 4px',
                          borderRadius: 8, background: bgColor,
                          border: isTarget ? `2px solid ${borderColor}` : '1px solid #f0f0f0',
                          position: 'relative',
                        }}>
                          <div style={{ fontSize: 11, color: '#999' }}>{s.date.substring(5)}</div>
                          <div style={{ fontSize: 10, color: '#bbb' }}>周{dayLabel}</div>
                          <Tag
                            color={s.category === 'work' ? 'green' : s.category === 'leave' ? 'orange' : 'blue'}
                            style={{ margin: '4px 0 0', fontSize: 11, padding: '0 4px' }}
                          >
                            {s.codeName}
                          </Tag>
                          {s.hours > 0 && <div style={{ fontSize: 10, color: '#666' }}>{s.hours}h</div>}
                          {isTarget && <div style={{ fontSize: 9, color: '#fa8c16', fontWeight: 600 }}>→ 申请日</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}

            {/* Reason */}
            <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fffbe6', borderRadius: 6, border: '1px solid #ffe58f' }}>
              <span style={{ color: '#ad6800', fontWeight: 500 }}>申请原因：</span>
              <span>{detailRecord.reason || '无'}</span>
            </div>

            {/* Type-specific content */}
            {/* 直接换班 */}
            {detailRecord.requestType === 'direct_swap' && (
              <Card size="small" title="直接换班信息" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '12px 0' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{detailRecord.applicantName}</div>
                    <Tag style={{ marginTop: 4 }}>{detailRecord.originalCodeName || '-'}</Tag>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{detailRecord.originalScheduleDate}</div>
                  </div>
                  <SwapOutlined style={{ fontSize: 28, color: '#1677ff' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{detailRecord.targetEmployeeName || '-'}</div>
                    <Tag style={{ marginTop: 4 }}>{detailRecord.targetCodeName || '-'}</Tag>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{detailRecord.targetDate || '-'}</div>
                  </div>
                </div>
                {detailRecord.originalCodeName && detailRecord.targetCodeName
                  && detailRecord.originalCodeName === detailRecord.targetCodeName && (
                  <Alert type="error" showIcon message="互换无意义"
                    description={`两人班次均为「${detailRecord.originalCodeName}」，建议拒绝此申请。`}
                    style={{ marginTop: 8 }} />
                )}
                <div style={{ marginTop: 8, padding: '8px 12px', background: detailRecord.peerStatus === 'peer_approved' ? '#f6ffed' : detailRecord.peerStatus === 'peer_rejected' ? '#fff2f0' : '#fffbe6', borderRadius: 6 }}>
                  <span style={{ fontWeight: 500 }}>对方确认：</span>
                  <Tag color={detailRecord.peerStatus === 'peer_approved' ? 'green' : detailRecord.peerStatus === 'peer_rejected' ? 'red' : 'gold'}>
                    {detailRecord.peerStatus === 'peer_approved' ? '已同意' : detailRecord.peerStatus === 'peer_rejected' ? '已拒绝' : '待确认'}
                  </Tag>
                  {detailRecord.peerRespondedAt && <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>{detailRecord.peerRespondedAt.substring(0, 16).replace('T', ' ')}</span>}
                </div>
              </Card>
            )}

            {/* 请假 (leave) */}
            {detailRecord.requestType === 'leave' && (
              <Card size="small" title="请假信息" style={{ marginBottom: 16 }}>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <Tag color="green" style={{ fontSize: 14 }}>{detailRecord.originalScheduleDate}  {detailRecord.originalCodeName} → 休</Tag>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>审批通过后将直接改为休息</div>
                </div>
              </Card>
            )}

            {/* 互换调班 (swap_with_payback) */}
            {detailRecord.requestType === 'swap_with_payback' && (
              <Card size="small" title="互换调班信息" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '8px 0' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600 }}>{detailRecord.applicantName}</div>
                    <Tag style={{ marginTop: 4 }}>{detailRecord.originalCodeName} → 休</Tag>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{detailRecord.originalScheduleDate}（休假）</div>
                  </div>
                  <SwapOutlined style={{ fontSize: 24, color: '#722ed1' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600 }}>{detailRecord.targetEmployeeName || '-'}</div>
                    <Tag color="purple" style={{ marginTop: 4 }}>休 → {detailRecord.originalCodeName}（顶班）</Tag>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{detailRecord.originalScheduleDate}</div>
                  </div>
                </div>
                {detailRecord.paybackDate && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#f9f0ff', borderRadius: 6, border: '1px solid #d3adf7' }}>
                    <span style={{ fontWeight: 500 }}>📅 还班日：</span>
                    <Tag color="purple">{detailRecord.paybackDate}</Tag>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 4, lineHeight: 1.6 }}>
                      {detailRecord.applicantName}(休→{detailRecord.paybackCodeName || '上班'}) 替回 {detailRecord.targetEmployeeName}({detailRecord.paybackCodeName || '班次'}→休)
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 8, padding: '8px 12px', background: detailRecord.peerStatus === 'peer_approved' ? '#f6ffed' : detailRecord.peerStatus === 'peer_rejected' ? '#fff2f0' : '#fffbe6', borderRadius: 6 }}>
                  <span style={{ fontWeight: 500 }}>对方确认：</span>
                  <Tag color={detailRecord.peerStatus === 'peer_approved' ? 'green' : detailRecord.peerStatus === 'peer_rejected' ? 'red' : 'gold'}>
                    {detailRecord.peerStatus === 'peer_approved' ? '已同意' : detailRecord.peerStatus === 'peer_rejected' ? '已拒绝' : '待确认'}
                  </Tag>
                  {detailRecord.peerRespondedAt && <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>{detailRecord.peerRespondedAt.substring(0, 16).replace('T', ' ')}</span>}
                </div>
              </Card>
            )}

            {/* 旧类型: swap */}
            {detailRecord.requestType === 'swap' && (
              <Card size="small" title="互换信息" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '12px 0' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{detailRecord.applicantName}</div>
                    <Tag style={{ marginTop: 4 }}>{detailRecord.originalCodeName || '-'}</Tag>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{detailRecord.originalScheduleDate}</div>
                  </div>
                  <SwapOutlined style={{ fontSize: 28, color: '#1677ff' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{detailRecord.targetEmployeeName || '-'}</div>
                    <Tag style={{ marginTop: 4 }}>{detailRecord.targetCodeName || '-'}</Tag>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{detailRecord.targetDate || '-'}</div>
                  </div>
                </div>
              </Card>
            )}

            {/* 旧类型: take_off */}
            {detailRecord.requestType === 'take_off' && (
              <Card size="small" title="请假信息" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '12px 0' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600 }}>{detailRecord.applicantName}</div>
                    <Tag style={{ marginTop: 4 }}>{detailRecord.originalCodeName} → 休</Tag>
                  </div>
                  {detailRecord.targetEmployeeName ? (
                    <>
                      <SwapOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600 }}>{detailRecord.targetEmployeeName}</div>
                        <Tag color="green" style={{ marginTop: 4 }}>休 → {detailRecord.originalCodeName}</Tag>
                      </div>
                    </>
                  ) : (
                    <Tag color="orange">直接休息（无替班人）</Tag>
                  )}
                </div>
                {detailRecord.paybackDate && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#e6f4ff', borderRadius: 6 }}>
                    <span style={{ fontWeight: 500 }}>📅 还班日期：</span><Tag color="cyan">{detailRecord.paybackDate}</Tag>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{detailRecord.applicantName}（{detailRecord.originalCodeName} → 上班）替回 {detailRecord.targetEmployeeName}（{detailRecord.originalCodeName} → 休息）</div>
                  </div>
                )}
                <div style={{ marginTop: 8, padding: '8px 12px', background: detailRecord.peerStatus === 'peer_approved' ? '#f6ffed' : detailRecord.peerStatus === 'peer_rejected' ? '#fff2f0' : '#fffbe6', borderRadius: 6 }}>
                  <span style={{ fontWeight: 500 }}>对方确认：</span>
                  <Tag color={detailRecord.peerStatus === 'peer_approved' ? 'green' : detailRecord.peerStatus === 'peer_rejected' ? 'red' : 'gold'}>
                    {detailRecord.peerStatus === 'peer_approved' ? '已同意' : detailRecord.peerStatus === 'peer_rejected' ? '已拒绝' : detailRecord.peerStatus === 'pending_peer' ? '待确认' : '无需'}
                  </Tag>
                  {detailRecord.peerRespondedAt && <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>{detailRecord.peerRespondedAt.substring(0, 16).replace('T', ' ')}</span>}
                </div>
              </Card>
            )}

            {/* Approval comment */}
            {isPending && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>审批意见（选填）</div>
                <Input.TextArea
                  rows={2}
                  value={approvalComment}
                  onChange={e => setApprovalComment(e.target.value)}
                  placeholder="输入审批意见..."
                />
              </div>
            )}

            {/* Past approval info */}
            {detailRecord.approvedAt && (
              <Card size="small" style={{ background: '#fafafa' }}>
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="审批时间">
                    {detailRecord.approvedAt.substring(0, 16).replace('T', ' ')}
                  </Descriptions.Item>
                  <Descriptions.Item label="审批人">
                    {detailRecord.approverName || detailRecord.approverUserAccountId || '-'}
                  </Descriptions.Item>
                  {detailRecord.approvalComment && (
                    <Descriptions.Item label="审批意见" span={2}>
                      {detailRecord.approvalComment}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Sub-component: Monthly hours impact preview panel */
function HoursImpactPreview({
  detailRecord,
  selectedReplacement,
  replacements,
  hoursImpact,
  loadingImpact,
  setHoursImpact,
  setLoadingImpact,
}: {
  detailRecord: ShiftChangeRequestRecord;
  selectedReplacement: string;
  replacements: AvailableReplacement[];
  hoursImpact: { applicant: HoursImpact; replacement: HoursImpact } | null;
  loadingImpact: boolean;
  setHoursImpact: (v: { applicant: HoursImpact; replacement: HoursImpact } | null) => void;
  setLoadingImpact: (v: boolean) => void;
}) {
  // Auto-load impact when selectedReplacement changes
  useEffect(() => {
    if (!selectedReplacement || !detailRecord.scheduleVersionId || !detailRecord.originalScheduleDate) return;
    let cancelled = false;
    (async () => {
      setLoadingImpact(true);
      try {
        const replacementName = replacements.find(r => r.employeeId === selectedReplacement)?.employeeName || '替班人';
        const impact = await getMonthlyHoursImpact({
          applicantEmployeeId: detailRecord.applicantEmployeeId,
          applicantName: detailRecord.applicantName || '申请人',
          replacementEmployeeId: selectedReplacement,
          replacementName,
          scheduleVersionId: detailRecord.scheduleVersionId!,
          scheduleDate: detailRecord.originalScheduleDate!,
          shiftPlannedHours: detailRecord.originalPlannedHours ?? 8,
        });
        if (!cancelled) setHoursImpact(impact);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingImpact(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedReplacement, detailRecord.scheduleVersionId, detailRecord.originalScheduleDate]);

  if (loadingImpact) {
    return (
      <div style={{ marginTop: 12, padding: 16, background: '#f0f5ff', borderRadius: 8, border: '1px solid #adc6ff', textAlign: 'center' }}>
        <Spin size="small" /> <span style={{ marginLeft: 8, color: '#666' }}>正在计算工时影响...</span>
      </div>
    );
  }

  if (!hoursImpact) return null;

  const monthLabel = detailRecord.originalScheduleDate ? detailRecord.originalScheduleDate.substring(0, 7) : '';

  function renderRow(impact: HoursImpact, direction: 'down' | 'up') {
    const diff = impact.projectedMonthlyHours - impact.currentMonthlyHours;
    const isOverLimit = impact.monthlyHoursLimit != null && impact.projectedMonthlyHours > impact.monthlyHoursLimit;
    const diffColor = direction === 'down' ? '#fa8c16' : (isOverLimit ? '#ff4d4f' : '#52c41a');
    const arrow = direction === 'down' ? '↓' : '↑';
    const usagePercent = impact.monthlyHoursLimit ? Math.round((impact.projectedMonthlyHours / impact.monthlyHoursLimit) * 100) : null;

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 90px 20px 90px 60px 1fr',
        alignItems: 'center',
        gap: 4,
        padding: '6px 0',
        fontSize: 13,
      }}>
        <span style={{ fontWeight: 600 }}>{impact.employeeName}</span>
        <span style={{ textAlign: 'right' }}>{impact.currentMonthlyHours.toFixed(1)}h</span>
        <span style={{ textAlign: 'center', color: diffColor, fontWeight: 700 }}>{arrow}</span>
        <span style={{
          textAlign: 'right',
          fontWeight: 700,
          color: isOverLimit ? '#ff4d4f' : undefined,
        }}>
          {impact.projectedMonthlyHours.toFixed(1)}h
        </span>
        <span style={{ color: diffColor, fontSize: 12 }}>
          ({diff > 0 ? '+' : ''}{diff.toFixed(1)}h)
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {impact.monthlyHoursLimit != null && (
            <>
              <div style={{
                flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3,
                overflow: 'hidden', minWidth: 60,
              }}>
                <div style={{
                  width: `${Math.min(usagePercent || 0, 100)}%`,
                  height: '100%',
                  background: isOverLimit ? '#ff4d4f' : (usagePercent! > 90 ? '#faad14' : '#52c41a'),
                  borderRadius: 3,
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap' }}>
                {usagePercent}%
              </span>
            </>
          )}
          {isOverLimit && (
            <Tag color="red" style={{ fontSize: 11, margin: 0, lineHeight: '18px', padding: '0 4px' }}>超限</Tag>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 12, padding: 12,
      background: '#f0f5ff', borderRadius: 8,
      border: '1px solid #adc6ff',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <CalendarOutlined style={{ color: '#1677ff' }} />
        <span>📊 工时影响预览</span>
        <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{monthLabel}</Tag>
        {hoursImpact.applicant.monthlyHoursLimit != null && (
          <span style={{ fontSize: 11, color: '#999', marginLeft: 'auto' }}>
            月上限: {hoursImpact.applicant.monthlyHoursLimit}h
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '80px 90px 20px 90px 60px 1fr', gap: 4, padding: '0 0 4px 0', fontSize: 11, color: '#999', borderBottom: '1px solid #d6e4ff', marginBottom: 4 }}>
        <span>员工</span>
        <span style={{ textAlign: 'right' }}>变更前</span>
        <span></span>
        <span style={{ textAlign: 'right' }}>变更后</span>
        <span>差值</span>
        <span>月度用量</span>
      </div>

      {renderRow(hoursImpact.applicant, 'down')}
      {renderRow(hoursImpact.replacement, 'up')}

      {hoursImpact.replacement.monthlyHoursLimit != null &&
        hoursImpact.replacement.projectedMonthlyHours > hoursImpact.replacement.monthlyHoursLimit && (
        <Alert
          type="warning"
          showIcon
          message={`${hoursImpact.replacement.employeeName} 替班后月度工时将超过上限 ${hoursImpact.replacement.monthlyHoursLimit}h`}
          style={{ marginTop: 8, fontSize: 12 }}
        />
      )}
    </div>
  );
}
