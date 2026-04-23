import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Table, Button, Space, Typography, message, Tag, Modal, Input, Descriptions, Badge, Select, Card, Divider, Empty, Spin, Tooltip, Alert } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined, ExpandOutlined, FilterOutlined, SwapOutlined, UserSwitchOutlined, SearchOutlined, CalendarOutlined, WarningOutlined } from '@ant-design/icons';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { approveShiftChange, listShiftChangeRequests, loadShiftChangeReferences, findAvailableReplacements, getMonthlyHoursImpact, type HoursImpact } from '@/app/services/shift-change.service';
import { validateShiftChange, type ValidationResult } from '@/app/services/labor-rule.service';
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

  // For direct_change approval workflow
  const [replacements, setReplacements] = useState<AvailableReplacement[]>([]);
  const [selectedReplacement, setSelectedReplacement] = useState<string | null>(null);
  const [loadingReplacements, setLoadingReplacements] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  // Hours impact preview
  const [hoursImpact, setHoursImpact] = useState<{ applicant: HoursImpact; replacement: HoursImpact } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

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
    } catch (error) {
      message.error(getErrorMessage(error, '加载调班申请失败'));
    } finally {
      setLoading(false);
    }
  }

  // When opening detail for direct_change pending request, load available replacements
  async function openDetail(record: ShiftChangeRequestRecord) {
    setDetailRecord(record);
    setSelectedReplacement(null);
    setApprovalComment('');
    setReplacements([]);
    setHoursImpact(null);

    if (record.requestType === 'direct_change' && !record.approvedAt && record.originalScheduleDate) {
      setLoadingReplacements(true);
      try {
        // We need the schedule_version_id from the original schedule
        const { supabase } = await import('@/app/lib/supabase/client');
        const { data: schedData } = await supabase
          .from('schedule')
          .select('schedule_version_id')
          .eq('id', record.originalScheduleId)
          .single();

        if (schedData?.schedule_version_id) {
          const available = await findAvailableReplacements(
            record.originalScheduleDate,
            schedData.schedule_version_id,
          );
          // Filter out the applicant themselves
          setReplacements(available.filter(r => r.employeeId !== record.applicantEmployeeId));
        }
      } catch (error) {
        message.error(getErrorMessage(error, '查询可用替班人员失败'));
      } finally {
        setLoadingReplacements(false);
      }
    }
  }

  async function handleApproval(record: ShiftChangeRequestRecord, approved: boolean) {
    if (!currentUser?.id) {
      message.warning('当前未登录，无法执行审批');
      return;
    }

    // For direct_change approval, must have a replacement selected
    if (approved && record.requestType === 'direct_change' && !selectedReplacement) {
      message.warning('请先选择替班人员');
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

        // Validate replacement employee (gaining hours)
        const replacementEmpId = record.requestType === 'direct_change' && selectedReplacement
          ? selectedReplacement
          : record.applicantEmployeeId;
        const replacementName = record.requestType === 'direct_change'
          ? (replacements.find(r => r.employeeId === selectedReplacement)?.employeeName || '替班人')
          : (record.applicantName || '申请人');
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
        replacementEmployeeId: approved && record.requestType === 'direct_change'
          ? selectedReplacement!
          : undefined,
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
    Modal.confirm({
      title: approved ? '确认通过' : '确认拒绝',
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>{`确定${approved ? '通过' : '拒绝'}此${record.requestType === 'swap' ? '互换调班' : '调班'}申请？`}</span>
          {record.requestType === 'swap' && approved && (
            <div style={{ background: '#f6ffed', padding: 12, borderRadius: 8, border: '1px solid #b7eb8f' }}>
              <div><strong>{record.applicantName}</strong> 的 {record.originalCodeName} ↔ <strong>{record.targetEmployeeName}</strong> 的班次将互换</div>
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
        <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        {selectedRowKeys.length > 0 && (
          <Space>
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
          </Space>
        )}
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
            title: '调班类型', dataIndex: 'requestType', width: 100,
            render: (value: string) => (
              <Tag
                icon={value === 'swap' ? <SwapOutlined /> : <UserSwitchOutlined />}
                color={value === 'swap' ? 'blue' : 'orange'}
              >
                {value === 'swap' ? '互换调班' : '直接变更'}
              </Tag>
            ),
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
              return (
                <div>
                  <div style={{ fontSize: 12, color: '#999' }}>申请调休</div>
                  {record.targetCodeName && <Tag color="green">{record.targetCodeName}</Tag>}
                  {!record.targetCodeName && <Tag>需安排替班</Tag>}
                </div>
              );
            },
          },
          { title: '原因', dataIndex: 'reason', width: 100, ellipsis: true },
          {
            title: '申请时间', dataIndex: 'createdAt', width: 140,
            render: (value?: string | null) => {
              if (!value) return '-';
              try {
                const d = new Date(value);
                return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
              } catch { return value.substring(0, 16).replace('T', ' '); }
            },
          },
          {
            title: '审批状态', width: 90,
            render: (_: unknown, record: ShiftChangeRequestRecord) => {
              const color = record.statusCode?.includes('approved') ? 'green'
                : record.statusCode?.includes('rejected') ? 'red' : 'orange';
              return <Tag color={color}>{record.statusName}</Tag>;
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
                  record.requestType === 'swap' ? (
                    <>
                      <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }}
                        onClick={() => handleQuickApproval(record, true)}>通过</Button>
                      <Button type="link" size="small" icon={<CloseOutlined />} danger
                        onClick={() => handleQuickApproval(record, false)}>拒绝</Button>
                    </>
                  ) : (
                    <Button type="link" size="small" icon={<UserSwitchOutlined />} style={{ color: '#fa8c16' }}
                      onClick={() => openDetail(record)}>安排替班</Button>
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
              disabled={detailRecord?.requestType === 'direct_change' && !selectedReplacement}
            >
              {detailRecord?.requestType === 'direct_change' ? '确认替班并通过' : '通过'}
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
                icon={detailRecord.requestType === 'swap' ? <SwapOutlined /> : <UserSwitchOutlined />}
                color={detailRecord.requestType === 'swap' ? 'blue' : 'orange'}
                style={{ fontSize: 14, padding: '4px 12px' }}
              >
                {detailRecord.requestType === 'swap' ? '互换调班' : '直接变更'}
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

            {/* Reason */}
            <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fffbe6', borderRadius: 6, border: '1px solid #ffe58f' }}>
              <span style={{ color: '#ad6800', fontWeight: 500 }}>申请原因：</span>
              <span>{detailRecord.reason || '无'}</span>
            </div>

            {/* Type-specific content */}
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
                    <Tag style={{ marginTop: 4 }}>{detailRecord.targetCodeName || '对方班次'}</Tag>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{detailRecord.targetDate || '-'}</div>
                  </div>
                </div>
              </Card>
            )}

            {detailRecord.requestType === 'direct_change' && isPending && (
              <Card
                size="small"
                title={<span><UserSwitchOutlined style={{ marginRight: 6 }} />选择替班人员</span>}
                style={{ marginBottom: 16, border: '2px solid #fa8c16' }}
              >
                <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
                  <strong>{detailRecord.applicantName}</strong> 申请在 <Tag>{detailRecord.originalScheduleDate}</Tag> 调休，
                  请从以下当天休息的员工中选择一位替班：
                </div>

                {loadingReplacements ? (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <Spin tip="正在查找可用替班人员..." />
                  </div>
                ) : replacements.length === 0 ? (
                  <Empty description="当天没有可用的替班人员（所有人都有排班）" />
                ) : (
                  <Select
                    style={{ width: '100%' }}
                    placeholder="搜索并选择替班人员"
                    value={selectedReplacement}
                    onChange={setSelectedReplacement}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={replacements.map(r => ({
                      value: r.employeeId,
                      label: `${r.employeeName} - ${r.departmentName}${r.employeeNo ? ` (${r.employeeNo})` : ''}`,
                    }))}
                    size="large"
                  />
                )}

                {selectedReplacement && (
                  <div style={{
                    marginTop: 12, padding: 12, background: '#f6ffed',
                    borderRadius: 8, border: '1px solid #b7eb8f',
                  }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>📋 变更预览</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag color="orange">{detailRecord.applicantName}</Tag>
                      <span>{detailRecord.originalCodeName}</span>
                      <span>→</span>
                      <Tag color="default">休</Tag>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Tag color="blue">{replacements.find(r => r.employeeId === selectedReplacement)?.employeeName}</Tag>
                      <span>休</span>
                      <span>→</span>
                      <Tag color="green">{detailRecord.originalCodeName}</Tag>
                    </div>
                  </div>
                )}

                {/* Hours Impact Preview */}
                {selectedReplacement && (
                  <HoursImpactPreview
                    detailRecord={detailRecord}
                    selectedReplacement={selectedReplacement}
                    replacements={replacements}
                    hoursImpact={hoursImpact}
                    loadingImpact={loadingImpact}
                    setHoursImpact={setHoursImpact}
                    setLoadingImpact={setLoadingImpact}
                  />
                )}
              </Card>
            )}

            {detailRecord.requestType === 'direct_change' && !isPending && detailRecord.targetEmployeeName && (
              <Card size="small" title="替班信息" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '12px 0' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600 }}>{detailRecord.applicantName}</div>
                    <Tag style={{ marginTop: 4 }}>{detailRecord.originalCodeName} → 休</Tag>
                  </div>
                  <SwapOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600 }}>{detailRecord.targetEmployeeName}</div>
                    <Tag color="green" style={{ marginTop: 4 }}>休 → {detailRecord.originalCodeName}</Tag>
                  </div>
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
                    {detailRecord.approverUserAccountId || '-'}
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
