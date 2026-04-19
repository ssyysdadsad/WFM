import React, { useEffect, useState } from 'react';
import { Card, Tabs, Table, Typography, Button, message } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ReloadOutlined } from '@ant-design/icons';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import {
  getDeviceUsageReport,
  getEmployeeProfileReport,
  getTaskCompletionReport,
  getWorkHoursSummary,
} from '@/app/services/report.service';
import type {
  DeviceUsageReportRow,
  EmployeeProfileReportRow,
  TaskCompletionReportRow,
  WorkHoursSummaryRow,
} from '@/app/types/report';

export function ReportPage() {
  const [profileRows, setProfileRows] = useState<EmployeeProfileReportRow[]>([]);
  const [workHourRows, setWorkHourRows] = useState<WorkHoursSummaryRow[]>([]);
  const [taskRows, setTaskRows] = useState<TaskCompletionReportRow[]>([]);
  const [deviceRows, setDeviceRows] = useState<DeviceUsageReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [employeeProfile, workHoursSummary, taskCompletion, deviceUsage] = await Promise.all([
        getEmployeeProfileReport(),
        getWorkHoursSummary(),
        getTaskCompletionReport(),
        getDeviceUsageReport(),
      ]);
      setProfileRows(employeeProfile);
      setWorkHourRows(workHoursSummary);
      setTaskRows(taskCompletion);
      setDeviceRows(deviceUsage);
    } catch (error) {
      message.error(getErrorMessage(error, '加载报表失败'));
    } finally {
      setLoading(false);
    }
  }

  const chartData = workHourRows.slice(0, 20);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>统计报表</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
      </div>
      <Tabs items={[
        {
          key: 'profile',
          label: '员工工时画像',
          children: (
            <>
              <Card size="small" style={{ marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                  <Bar dataKey="avgDailyHours7d" name="近7日均工时" fill="#1677ff" />
                  <Bar dataKey="avgDailyHours30d" name="近30日均工时" fill="#52c41a" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Table rowKey="employeeId" loading={loading} dataSource={profileRows} size="small"
                columns={[
                  { title: '工号', dataIndex: 'employeeNo', width: 80 },
                  { title: '姓名', dataIndex: 'fullName', width: 80 },
                  { title: '近7日均工时', dataIndex: 'avgDailyHours7d', width: 110 },
                  { title: '近30日均工时', dataIndex: 'avgDailyHours30d', width: 110 },
                  { title: '近30日均单次', dataIndex: 'avgShiftHours30d', width: 110 },
                  { title: '近30日均周工时', dataIndex: 'avgWeeklyHours30d', width: 120 },
                  { title: '累计工时', dataIndex: 'totalHours', width: 100 },
                  { title: '更新时间', dataIndex: 'calculatedAt', width: 140, render: (v: string) => v?.substring(0, 16) || '-' },
                ]}
              />
            </>
          ),
        },
        {
          key: 'schedule',
          label: '任务与设备',
          children: (
            <>
              <Card size="small" title="任务完成报表" style={{ marginBottom: 16 }}>
                <Table
                  rowKey="taskId"
                  loading={loading}
                  dataSource={taskRows}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '项目', dataIndex: 'projectName', width: 120 },
                    { title: '任务', dataIndex: 'taskName', width: 140 },
                    { title: '目标工时', dataIndex: 'plannedHours', width: 100 },
                    { title: '已排工时', dataIndex: 'scheduledHours', width: 100 },
                    { title: '完成率', dataIndex: 'completionRate', width: 90, render: (v: number) => `${Math.round(v * 100)}%` },
                  ]}
                />
              </Card>
              <Card size="small" title="设备使用报表">
                <Table
                  rowKey="deviceId"
                  loading={loading}
                  dataSource={deviceRows}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '设备', dataIndex: 'deviceName', width: 140 },
                    { title: '使用天数', dataIndex: 'usageDays', width: 100 },
                    { title: '使用工时', dataIndex: 'usageHours', width: 100 },
                  ]}
                />
              </Card>
            </>
          ),
        },
      ]} />
    </div>
  );
}
