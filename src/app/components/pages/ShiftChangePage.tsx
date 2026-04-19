import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, message, Tag, Modal, Input } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { approveShiftChange, listShiftChangeRequests, loadShiftChangeReferences } from '@/app/services/shift-change.service';
import type { ReferenceOption } from '@/app/types/master-data';
import type { ApprovalStatusOption, ShiftChangeRequestRecord } from '@/app/types/shift-change';

export function ShiftChangePage() {
  const { currentUser } = useCurrentUser();
  const [data, setData] = useState<ShiftChangeRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<ReferenceOption[]>([]);
  const [statusItems, setStatusItems] = useState<ApprovalStatusOption[]>([]);

  useEffect(() => { loadData(); loadRefs(); }, []);

  async function loadRefs() {
    try {
      const refs = await loadShiftChangeReferences();
      setEmployees(refs.employees);
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

  async function handleApproval(id: string, approved: boolean) {
    Modal.confirm({
      title: approved ? '确认通过' : '确认拒绝',
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>{`确定${approved ? '通过' : '拒绝'}此调班申请？`}</span>
          <Input.TextArea id="shift-change-approval-comment" rows={3} placeholder="审批意见（选填）" />
        </Space>
      ),
      onOk: async () => {
        try {
          if (!currentUser?.id) {
            message.warning('当前未登录，无法执行审批');
            return;
          }

          const commentElement = document.getElementById('shift-change-approval-comment') as HTMLTextAreaElement | null;
          await approveShiftChange({
            shiftChangeRequestId: id,
            action: approved ? 'approve' : 'reject',
            approvalComment: commentElement?.value,
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

  const empMap = Object.fromEntries(employees.map((item) => [item.id, item.label]));
  const statusMap = Object.fromEntries(statusItems.map((item) => [item.id, item]));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>调班审批</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
      </div>
      <Table rowKey="id" loading={loading} dataSource={data} size="small"
        columns={[
          { title: '调班类型', dataIndex: 'requestType', width: 100, render: (value: string) => <Tag color={value === 'swap' ? 'blue' : 'orange'}>{value === 'swap' ? '互换调班' : '直接变更'}</Tag> },
          { title: '申请人', dataIndex: 'applicantEmployeeId', width: 80, render: (value: string) => empMap[value] || '-' },
          { title: '目标员工', dataIndex: 'targetEmployeeId', width: 80, render: (value?: string | null) => value ? empMap[value] || '-' : '-' },
          { title: '目标日期', dataIndex: 'targetDate', width: 100 },
          { title: '原因', dataIndex: 'reason', ellipsis: true },
          { title: '审批状态', dataIndex: 'approvalStatusDictItemId', width: 100, render: (value: string) => {
            const item = statusMap[value];
            const color = item?.itemCode?.includes('approved') ? 'green' : item?.itemCode?.includes('rejected') ? 'red' : 'orange';
            return <Tag color={color}>{item?.itemName || '-'}</Tag>;
          }},
          { title: '审批时间', dataIndex: 'approvedAt', width: 140, render: (value?: string | null) => value?.substring(0, 16) || '-' },
          { title: '操作', key: 'action', width: 140, render: (_: unknown, record: ShiftChangeRequestRecord) => (
            <Space>
              <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }} onClick={() => handleApproval(record.id, true)}>通过</Button>
              <Button type="link" size="small" icon={<CloseOutlined />} danger onClick={() => handleApproval(record.id, false)}>拒绝</Button>
            </Space>
          )},
        ]}
      />
    </div>
  );
}
