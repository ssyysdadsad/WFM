import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Spin, message } from 'antd';
import { TeamOutlined, ProjectOutlined, CalendarOutlined, ToolOutlined, NotificationOutlined, BranchesOutlined, EnvironmentOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { getDashboardOverview, getWorkHoursSummary } from '@/app/services/report.service';
import type { DashboardOverview, WorkHoursSummaryRow } from '@/app/types/report';

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

export function DashboardPage() {
  const [stats, setStats] = useState({
    employees: 0, projects: 0, schedules: 0, devices: 0,
    departments: 0, scenes: 0, channels: 0, skills: 0,
  });
  const [announcements, setAnnouncements] = useState<DashboardOverview['announcements']>([]);
  const [loading, setLoading] = useState(true);
  const [projectStatusData, setProjectStatusData] = useState<any[]>([]);
  const [deptEmployeeData, setDeptEmployeeData] = useState<any[]>([]);
  const [recentSchedules, setRecentSchedules] = useState<DashboardOverview['recentSchedules']>([]);
  const [workMetrics, setWorkMetrics] = useState<WorkHoursSummaryRow[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [overview, workHoursSummary] = await Promise.all([
        getDashboardOverview(),
        getWorkHoursSummary(),
      ]);
      setStats(overview.stats);
      setAnnouncements(overview.announcements);
      setProjectStatusData(overview.projectStatusData);
      setDeptEmployeeData(overview.deptEmployeeData);
      setRecentSchedules(overview.recentSchedules);
      setWorkMetrics(workHoursSummary);
    } catch (error) {
      message.error(getErrorMessage(error, '仪表盘数据加载失败'));
      console.error('Dashboard load error:', error);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#999' }}>加载中...</div>
      </div>
    );
  }

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>工作台</Typography.Title>

      {/* Stats Row 1 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="员工总数" value={stats.employees} prefix={<TeamOutlined />} styles={{ content: { color: '#1677ff' } }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="项目总数" value={stats.projects} prefix={<ProjectOutlined />} styles={{ content: { color: '#52c41a' } }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="排班记录" value={stats.schedules} prefix={<CalendarOutlined />} styles={{ content: { color: '#faad14' } }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="设备数量" value={stats.devices} prefix={<ToolOutlined />} styles={{ content: { color: '#722ed1' } }} />
          </Card>
        </Col>
      </Row>

      {/* Stats Row 2 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="部门数量" value={stats.departments} prefix={<TeamOutlined />} styles={{ content: { color: '#13c2c2' } }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="场景数量" value={stats.scenes} prefix={<EnvironmentOutlined />} styles={{ content: { color: '#eb2f96' } }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="渠道数量" value={stats.channels} prefix={<BranchesOutlined />} styles={{ content: { color: '#fa8c16' } }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="技能数量" value={stats.skills} prefix={<SafetyCertificateOutlined />} styles={{ content: { color: '#2f54eb' } }} />
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="各部门员工分布" size="small">
            {deptEmployeeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={deptEmployeeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="员工数" fill="#1677ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>暂无部门员工数据</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="项目状态分布" size="small">
            {projectStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={projectStatusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {projectStatusData.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>暂无项目状态数据</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Work Metrics Chart */}
      {workMetrics.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card title="员工工时概览" size="small">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={workMetrics}>
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
          </Col>
        </Row>
      )}

      {/* Recent Schedules & Announcements */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="最近排班记录" size="small">
            {recentSchedules.length > 0 ? (
              <Table
                rowKey="id"
                dataSource={recentSchedules}
                size="small"
                pagination={false}
                columns={[
                  { title: '员工', dataIndex: 'employeeName', width: 80 },
                  { title: '日期', dataIndex: 'scheduleDate', width: 100 },
                  { title: '班次', dataIndex: 'scheduleCodeName', width: 80, render: (v: string) => <Tag color="blue">{v}</Tag> },
                  { title: '工时', dataIndex: 'plannedHours', width: 60 },
                ]}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无排班记录</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={<><NotificationOutlined /> 最新公告</>} size="small">
            {announcements.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无公告</div>
            ) : (
              announcements.map((item: any) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{item.title}</div>
                    <div style={{ color: '#999', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.content?.substring(0, 80)}</div>
                  </div>
                  <span style={{ color: '#999', fontSize: 12, flexShrink: 0, marginLeft: 16 }}>{(item.publishedAt || item.createdAt)?.substring(0, 10) || '-'}</span>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
