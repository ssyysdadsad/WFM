import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Spin, Tabs, Progress, message, Select, DatePicker, Button, Space } from 'antd';
import {
  CalendarOutlined, TeamOutlined, ClockCircleOutlined, BarChartOutlined,
  CoffeeOutlined, ReloadOutlined, TrophyOutlined, ApartmentOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, ReferenceArea,
} from 'recharts';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import {
  getScheduleOverviewReport,
  getTaskCompletionReport,
  getDeviceUsageReport,
} from '@/app/services/report.service';
import type { ScheduleOverviewData } from '@/app/services/report.service';
import type { TaskCompletionReportRow, DeviceUsageReportRow } from '@/app/types/report';

const GRADIENT_CARDS = [
  { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', icon: <CalendarOutlined />, label: '排班总数' },
  { bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', icon: <ClockCircleOutlined />, label: '出勤人次' },
  { bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', icon: <CoffeeOutlined />, label: '休息人次' },
  { bg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', icon: <BarChartOutlined />, label: '总工时(h)' },
  { bg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', icon: <BarChartOutlined />, label: '日均工时(h)' },
];

const PIE_COLORS = ['#3B82F6', '#60A5FA', '#8B5CF6', '#A78BFA', '#94A3B8', '#F59E0B', '#10B981', '#F472B6'];

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  border: '1px solid #f0f0f0',
};

function StatCard({ bg, icon, label, value }: { bg: string; icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div style={{
      background: bg, borderRadius: 16, padding: '24px 20px', color: '#fff',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -16, right: -16, fontSize: 80, opacity: 0.1 }}>{icon}</div>
      <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: '12px 16px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid #e5e7eb',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#1f2937' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color, display: 'inline-block' }} />
          <span style={{ color: '#6b7280' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: '#1f2937' }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ReportPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ScheduleOverviewData | null>(null);
  const [taskRows, setTaskRows] = useState<TaskCompletionReportRow[]>([]);
  const [deviceRows, setDeviceRows] = useState<DeviceUsageReportRow[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [ov, tasks, devices] = await Promise.all([
        getScheduleOverviewReport(),
        getTaskCompletionReport(),
        getDeviceUsageReport(),
      ]);
      setOverview(ov);
      setTaskRows(tasks);
      setDeviceRows(devices);
    } catch (error) {
      message.error(getErrorMessage(error, '加载报表失败'));
    } finally {
      setLoading(false);
    }
  }

  if (loading || !overview) {
    return (
      <div style={{ textAlign: 'center', padding: 120 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#6b7280' }}>加载统计数据...</div>
      </div>
    );
  }

  const { summary, dailyTrend, shiftDistribution, deptHours, topEmployees } = overview;

  // Identify weekend indices for ReferenceArea shading
  const weekendRanges: { start: string; end: string }[] = [];
  let rangeStart: string | null = null;
  dailyTrend.forEach((d, i) => {
    const dayOfWeek = dayjs(d.date).day(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend && !rangeStart) {
      rangeStart = d.label;
    }
    if (rangeStart && (!isWeekend || i === dailyTrend.length - 1)) {
      const endIdx = isWeekend ? i : i - 1;
      weekendRanges.push({ start: rangeStart, end: dailyTrend[endIdx].label });
      rangeStart = null;
    }
  });

  // Radar data for departments
  const maxHours = Math.max(...deptHours.map(d => d.totalHours), 1);
  const radarData = deptHours.map(d => ({
    subject: d.name,
    hours: d.totalHours,
    empCount: d.empCount * (maxHours / Math.max(...deptHours.map(x => x.empCount), 1)),
  }));

  const summaryValues = [summary.totalSchedules, summary.totalWorkDays, summary.totalRestDays, summary.totalHours, summary.avgDailyHours];

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>📊 统计报表</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>基于当前激活排班版本的数据统计与分析</Typography.Text>
        </div>
        <Space wrap>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              try {
                // Export department hours as CSV
                const headers = ['部门', '在岗人数', '总工时(h)', '场均工时(h)'];
                const rows = deptHours.map(d => [d.name, d.empCount, d.totalHours, d.avgHoursPerShift].join(','));
                const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const href = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = href;
                a.download = `排班统计报表_${dayjs().format('YYYY-MM-DD')}.csv`;
                a.click();
                URL.revokeObjectURL(href);
                message.success('报表已导出');
              } catch {
                message.error('导出失败');
              }
            }}
          >导出报表</Button>
          <button
            onClick={loadData}
            style={{
              background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff',
              border: 'none', borderRadius: 12, padding: '10px 24px', cursor: 'pointer',
              fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(102,126,234,0.3)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <ReloadOutlined /> 刷新数据
          </button>
        </Space>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {GRADIENT_CARDS.map((card, i) => (
          <div key={card.label} style={{ flex: '1 1 180px', minWidth: 180, maxWidth: 'calc(20% - 13px)' }}>
            <StatCard bg={card.bg} icon={card.icon} label={card.label} value={summaryValues[i]} />
          </div>
        ))}
      </div>

      <Tabs
        type="card"
        items={[
          {
            key: 'schedule',
            label: <span><CalendarOutlined /> 排班分析</span>,
            children: (
              <>
                {/* Daily Trend Area Chart */}
                <Card title={<span style={{ fontWeight: 600 }}>📈 每日出勤/休息趋势</span>} style={{ ...cardStyle, marginBottom: 20 }} bodyStyle={{ padding: '16px 20px' }}>
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={dailyTrend}>
                      <defs>
                        <linearGradient id="workGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="restGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      {weekendRanges.map((w, i) => (
                        <ReferenceArea key={`weekend-area-${i}`} x1={w.start} x2={w.end} fill="#FEE2E2" fillOpacity={0.5} label={{ value: '周末', position: 'insideTop', fontSize: 10, fill: '#F87171' }} />
                      ))}
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Area type="monotone" dataKey="workCount" name="出勤人数" stroke="#3B82F6" fill="url(#workGrad)" strokeWidth={2.5} dot={false} />
                      <Area type="monotone" dataKey="restCount" name="休息人数" stroke="#F59E0B" fill="url(#restGrad)" strokeWidth={2.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                <Row gutter={[20, 20]}>
                  {/* Shift Distribution Pie Chart */}
                  <Col xs={24} lg={10}>
                    <Card title={<span style={{ fontWeight: 600 }}>🎯 班次分布</span>} style={cardStyle} bodyStyle={{ padding: '12px 16px' }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie
                            data={shiftDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                            dataKey="value"
                            paddingAngle={3}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {shiftDistribution.map((entry, i) => (
                              <Cell key={entry.name} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>

                  {/* Daily Hours Bar Chart */}
                  <Col xs={24} lg={14}>
                    <Card title={<span style={{ fontWeight: 600 }}>⏱️ 每日总工时</span>} style={cardStyle} bodyStyle={{ padding: '12px 16px' }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={dailyTrend}>
                          <defs>
                            <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.9} />
                              <stop offset="95%" stopColor="#C084FC" stopOpacity={0.6} />
                            </linearGradient>
                          </defs>
                          {weekendRanges.map((w, i) => (
                            <ReferenceArea key={`weekend-hours-${i}`} x1={w.start} x2={w.end} fill="#FEE2E2" fillOpacity={0.4} />
                          ))}
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                          <YAxis fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="totalHours" name="总工时(h)" fill="url(#hoursGrad)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                </Row>
              </>
            ),
          },
          {
            key: 'department',
            label: <span><ApartmentOutlined /> 部门分析</span>,
            children: (
              <>
                <Row gutter={[20, 20]}>
                  {/* Dept Hours Table + Bar */}
                  <Col xs={24} lg={14}>
                    <Card title={<span style={{ fontWeight: 600 }}>🏢 部门工时对比</span>} style={{ ...cardStyle, marginBottom: 20 }} bodyStyle={{ padding: '12px 16px' }}>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={deptHours} layout="vertical" barSize={20}>
                          <defs>
                            <linearGradient id="deptGrad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.9} />
                              <stop offset="95%" stopColor="#60A5FA" stopOpacity={0.7} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={70} fontSize={12} tickLine={false} axisLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="totalHours" name="总工时(h)" fill="url(#deptGrad)" radius={[0, 8, 8, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>

                  {/* Radar Chart */}
                  <Col xs={24} lg={10}>
                    <Card title={<span style={{ fontWeight: 600 }}>📊 部门综合雷达</span>} style={{ ...cardStyle, marginBottom: 20 }} bodyStyle={{ padding: '12px 16px' }}>
                      <ResponsiveContainer width="100%" height={300}>
                        <RadarChart data={radarData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="subject" fontSize={12} />
                          <PolarRadiusAxis fontSize={10} />
                          <Radar name="工时" dataKey="hours" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.25} strokeWidth={2} />
                          <Tooltip />
                          <Legend />
                        </RadarChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                </Row>

                {/* Department Detail Table */}
                <Card title={<span style={{ fontWeight: 600 }}>📋 部门明细</span>} style={cardStyle} bodyStyle={{ padding: 0 }}>
                  <Table
                    dataSource={deptHours}
                    rowKey="name"
                    size="middle"
                    pagination={false}
                    columns={[
                      {
                        title: '部门', dataIndex: 'name', width: 120,
                        render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
                      },
                      {
                        title: '在岗人数', dataIndex: 'empCount', width: 100,
                        render: (v: number) => <Tag color="blue"><TeamOutlined /> {v}人</Tag>,
                      },
                      {
                        title: '总工时', dataIndex: 'totalHours', width: 120,
                        render: (v: number) => <span style={{ fontWeight: 600, color: '#3B82F6' }}>{v.toLocaleString()}h</span>,
                      },
                      { title: '场均工时', dataIndex: 'avgHoursPerShift', width: 100, render: (v: number) => `${v}h` },
                      {
                        title: '工时占比', key: 'bar', width: 200,
                        render: (_: unknown, row: typeof deptHours[0]) => {
                          const pct = summary.totalHours > 0 ? (row.totalHours / summary.totalHours) * 100 : 0;
                          return <Progress percent={Number(pct.toFixed(1))} size="small" strokeColor={{ '0%': '#3B82F6', '100%': '#60A5FA' }} />;
                        },
                      },
                    ]}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'employee',
            label: <span><TrophyOutlined /> 员工排行</span>,
            children: (
              <Card title={<span style={{ fontWeight: 600 }}>🏆 工时排行榜 TOP 15</span>} style={cardStyle} bodyStyle={{ padding: 0 }}>
                <Table
                  dataSource={topEmployees.map((e, i) => ({ ...e, rank: i + 1 }))}
                  rowKey="rank"
                  size="middle"
                  pagination={false}
                  columns={[
                    {
                      title: '排名', dataIndex: 'rank', width: 80, align: 'center' as const,
                      render: (v: number) => {
                        const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
                        if (medals[v]) return <span style={{ fontSize: 22 }}>{medals[v]}</span>;
                        return <span style={{ color: '#6b7280', fontWeight: 600 }}>{v}</span>;
                      },
                    },
                    {
                      title: '员工', dataIndex: 'name', width: 120,
                      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
                    },
                    { title: '部门', dataIndex: 'department', width: 120, render: (v: string) => <Tag>{v}</Tag> },
                    {
                      title: '出勤天数', dataIndex: 'workDays', width: 100,
                      render: (v: number) => <Tag color="green">{v}天</Tag>,
                    },
                    {
                      title: '总工时', dataIndex: 'totalHours', width: 120,
                      render: (v: number) => <span style={{ fontWeight: 700, color: '#8B5CF6', fontSize: 16 }}>{v}h</span>,
                    },
                    {
                      title: '工时进度', key: 'bar', width: 220,
                      render: (_: unknown, row: { totalHours: number }) => {
                        const maxH = topEmployees[0]?.totalHours || 1;
                        const pct = (row.totalHours / maxH) * 100;
                        return <Progress percent={Number(pct.toFixed(0))} size="small" strokeColor={{ '0%': '#8B5CF6', '100%': '#C084FC' }} />;
                      },
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'task',
            label: <span><BarChartOutlined /> 任务与设备</span>,
            children: (
              <>
                <Card
                  title={<span style={{ fontWeight: 600 }}>📋 任务完成报表</span>}
                  style={{ ...cardStyle, marginBottom: 20 }}
                  bodyStyle={{ padding: 0 }}
                >
                  {taskRows.length > 0 ? (
                    <Table
                      rowKey="taskId"
                      loading={loading}
                      dataSource={taskRows}
                      size="middle"
                      pagination={false}
                      columns={[
                        { title: '项目', dataIndex: 'projectName', width: 140, render: (v: string) => <span style={{ fontWeight: 500 }}>{v || '-'}</span> },
                        { title: '任务', dataIndex: 'taskName', width: 160 },
                        { title: '目标工时', dataIndex: 'plannedHours', width: 100, render: (v: number) => `${v}h` },
                        { title: '已排工时', dataIndex: 'scheduledHours', width: 100, render: (v: number) => <span style={{ color: '#3B82F6', fontWeight: 600 }}>{v}h</span> },
                        {
                          title: '完成率', dataIndex: 'completionRate', width: 160,
                          render: (v: number) => (
                            <Progress
                              percent={Math.min(Math.round(v * 100), 100)}
                              size="small"
                              status={v >= 1 ? 'success' : 'active'}
                              strokeColor={v >= 1 ? '#10B981' : { '0%': '#3B82F6', '100%': '#60A5FA' }}
                            />
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>暂无任务数据</div>
                  )}
                </Card>

                <Card
                  title={<span style={{ fontWeight: 600 }}>🔧 设备使用报表</span>}
                  style={cardStyle}
                  bodyStyle={{ padding: 0 }}
                >
                  {deviceRows.length > 0 ? (
                    <Table
                      rowKey="deviceId"
                      loading={loading}
                      dataSource={deviceRows}
                      size="middle"
                      pagination={false}
                      columns={[
                        { title: '设备', dataIndex: 'deviceName', width: 160, render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
                        { title: '使用天数', dataIndex: 'usageDays', width: 100, render: (v: number) => <Tag color="blue">{v}天</Tag> },
                        { title: '使用工时', dataIndex: 'usageHours', width: 120, render: (v: number) => <span style={{ fontWeight: 600, color: '#8B5CF6' }}>{v}h</span> },
                      ]}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>暂无设备数据</div>
                  )}
                </Card>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
