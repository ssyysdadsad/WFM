import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Card, Col, Row, Table, Tag, Typography, Spin, message, Badge, Select, Empty, Tooltip as AntTooltip, DatePicker } from 'antd';
import dayjs from 'dayjs';
import {
  TeamOutlined, ProjectOutlined, CalendarOutlined, ToolOutlined,
  NotificationOutlined, ClockCircleOutlined, ReloadOutlined,
  AuditOutlined, ThunderboltOutlined, UserOutlined,
  CheckCircleOutlined, PauseCircleOutlined, QuestionCircleOutlined,
} from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { getDashboardOverview, getWorkHoursSummary, getTodayEmployeeStatus, type TodayEmployeeRow } from '@/app/services/report.service';
import { supabase } from '@/app/lib/supabase/client';
import type { DashboardOverview, WorkHoursSummaryRow } from '@/app/types/report';

const PIE_COLORS = ['#3B82F6', '#60A5FA', '#8B5CF6', '#A78BFA', '#94A3B8', '#F59E0B', '#10B981', '#F472B6'];

/* ---------- Gradient Stat Card ---------- */
const GRADIENT_CARDS = [
  { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', icon: <TeamOutlined />,        label: '员工总数',   key: 'employees' as const, path: '/employee' },
  { bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',  icon: <ProjectOutlined />,     label: '项目总数',   key: 'projects' as const, path: '/project' },
  { bg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',  icon: <CalendarOutlined />,    label: '排班记录',   key: 'schedules' as const, path: '/schedule-version' },
  { bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', icon: <ClockCircleOutlined />,   label: '部门数量',   key: 'departments' as const, path: '/department' },
];

function StatCard({ bg, icon, label, value, onClick }: { bg: string; icon: React.ReactNode; label: string; value: number; onClick?: () => void }) {
  return (
    <div style={{
      background: bg, borderRadius: 16, padding: '24px 20px', color: '#fff',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', position: 'relative', overflow: 'hidden',
      transition: 'transform 0.2s', cursor: onClick ? 'pointer' : 'default',
    }}
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div style={{ position: 'absolute', top: -16, right: -16, fontSize: 80, opacity: 0.1 }}>{icon}</div>
      <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>{value.toLocaleString()}</div>
    </div>
  );
}

/* ---------- Custom Tooltip ---------- */
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

const cardStyle: React.CSSProperties = {
  borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
};

/* ---------- Main Component ---------- */
export function DashboardPage() {
  const navigate = useNavigate();
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
  const [pendingShiftChanges, setPendingShiftChanges] = useState(0);
  const [openUrgentShifts, setOpenUrgentShifts] = useState(0);
  // Today employee status
  const [todayStatus, setTodayStatus] = useState<TodayEmployeeRow[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [projectOptions, setProjectOptions] = useState<{ value: string; label: string }[]>([]);
  const [statusDate, setStatusDate] = useState<dayjs.Dayjs>(dayjs());

  useEffect(() => {
    loadData();
    loadProjectOptions();
    loadTodayStatus();
  }, []);

  // Reload status when project filter or date changes
  useEffect(() => {
    loadTodayStatus(projectFilter, statusDate.format('YYYY-MM-DD'));
  }, [projectFilter, statusDate]);

  async function loadProjectOptions() {
    try {
      const { data } = await supabase.from('project').select('id, project_name').order('project_name');
      setProjectOptions((data || []).map((p: any) => ({ value: p.id, label: p.project_name })));
    } catch { /* ignore */ }
  }

  async function loadTodayStatus(pid?: string, date?: string) {
    setTodayLoading(true);
    try {
      const rows = await getTodayEmployeeStatus(pid, date);
      setTodayStatus(rows);
    } catch (error) {
      console.error('Load today status error:', error);
    } finally {
      setTodayLoading(false);
    }
  }

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

      // Load todo counts
      try {
        const { count: scCount } = await supabase
          .from('shift_change_request')
          .select('id', { count: 'exact', head: true })
          .eq('approval_status_dict_item_id', (await supabase.from('dict_item').select('id').eq('item_code', 'pending').limit(1).single()).data?.id || '');
        setPendingShiftChanges(scCount || 0);
      } catch {
        // Try alternative approach
        const { data: scData } = await supabase.from('shift_change_request').select('id, approved_at').is('approved_at', null);
        setPendingShiftChanges(scData?.length || 0);
      }
      try {
        const { count: usCount } = await supabase
          .from('urgent_shift')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open');
        setOpenUrgentShifts(usCount || 0);
      } catch { /* ignore */ }
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>仪表盘</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>系统运营数据概览</Typography.Text>
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '6px 16px', borderRadius: 8, background: '#f5f5f5',
            transition: 'background 0.2s',
          }}
          onClick={loadData}
          onMouseEnter={e => (e.currentTarget.style.background = '#e8e8e8')}
          onMouseLeave={e => (e.currentTarget.style.background = '#f5f5f5')}
        >
          <ReloadOutlined />
          <span style={{ fontSize: 13 }}>刷新</span>
        </div>
      </div>

      {/* Gradient Stat Cards */}
      <Row gutter={[16, 16]}>
        {GRADIENT_CARDS.map(card => (
          <Col xs={12} sm={8} lg={6} key={card.key}>
            <StatCard bg={card.bg} icon={card.icon} label={card.label} value={stats[card.key]} onClick={() => navigate(card.path)} />
          </Col>
        ))}
      </Row>

      {/* Todo Cards */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} sm={8} lg={6}>
          <Card
            hoverable
            onClick={() => navigate('/shift-change')}
            style={{ ...cardStyle, cursor: 'pointer', borderLeft: pendingShiftChanges > 0 ? '4px solid #fa8c16' : '4px solid #52c41a' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>✉️ 待审批调班</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: pendingShiftChanges > 0 ? '#fa8c16' : '#52c41a' }}>
                  {pendingShiftChanges}
                </div>
              </div>
              <Badge count={pendingShiftChanges} offset={[0, 0]}>
                <AuditOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
              </Badge>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card
            hoverable
            onClick={() => navigate('/urgent-shift')}
            style={{ ...cardStyle, cursor: 'pointer', borderLeft: openUrgentShifts > 0 ? '4px solid #ff4d4f' : '4px solid #52c41a' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>⚡ 开放中紧急班次</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: openUrgentShifts > 0 ? '#ff4d4f' : '#52c41a' }}>
                  {openUrgentShifts}
                </div>
              </div>
              <Badge count={openUrgentShifts} offset={[0, 0]}>
                <ThunderboltOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
              </Badge>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Today Employee Status */}
      <TodayEmployeeStatusPanel
        data={todayStatus}
        loading={todayLoading}
        projectFilter={projectFilter}
        projectOptions={projectOptions}
        onProjectChange={setProjectFilter}
        selectedDate={statusDate}
        onDateChange={setStatusDate}
      />

      {/* Secondary Stats Row */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {[
          { label: '场景数量', value: stats.scenes, color: '#eb2f96' },
          { label: '渠道数量', value: stats.channels, color: '#fa8c16' },
          { label: '技能数量', value: stats.skills, color: '#2f54eb' },
        ].map(item => (
          <Col xs={8} key={item.label}>
            <Card style={{ ...cardStyle, textAlign: 'center' }} hoverable>
              <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{item.label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="📊 各部门员工分布" size="small" style={cardStyle}>
            {deptEmployeeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={deptEmployeeData}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#667eea" />
                      <stop offset="100%" stopColor="#764ba2" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="员工数" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>暂无部门员工数据</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="🎯 项目状态分布" size="small" style={cardStyle}>
            {projectStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {projectStatusData.map((entry, i) => <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
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
            <Card title="⏱ 员工工时概览" size="small" style={cardStyle}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={workMetrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="avgDailyHours7d" name="近7日均工时" fill="#667eea" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgDailyHours30d" name="近30日均工时" fill="#43e97b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      )}

      {/* Recent Schedules & Announcements */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="📅 最近排班记录" size="small" style={cardStyle}>
            {recentSchedules.length > 0 ? (
              <Table
                rowKey="id"
                dataSource={recentSchedules}
                size="small"
                pagination={{ pageSize: 6, showSizeChanger: false, size: 'small' }}
                columns={[
                  { title: '员工', dataIndex: 'employeeName', width: 80 },
                  { title: '日期', dataIndex: 'scheduleDate', width: 100 },
                  { title: '班次', dataIndex: 'scheduleCodeName', width: 80, render: (v: string) => <Tag color="blue">{v}</Tag> },
                  { title: '工时', dataIndex: 'plannedHours', width: 60, render: (v: number) => <span style={{ fontWeight: 600 }}>{v}h</span> },
                ]}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无排班记录</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title={<><NotificationOutlined style={{ color: '#fa709a' }} /> 最新公告</>}
            size="small"
            style={cardStyle}
          >
            {announcements.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无公告</div>
            ) : (
              announcements.map((item: any) => (
                <div key={item.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '12px 0', borderBottom: '1px solid #f5f5f5',
                  transition: 'background 0.2s', cursor: 'default',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, color: '#1f2937' }}>{item.title}</div>
                    <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.content?.substring(0, 80)}
                    </div>
                  </div>
                  <Tag color="default" style={{ flexShrink: 0, marginLeft: 12 }}>
                    {(item.publishedAt || item.createdAt)?.substring(0, 10) || '-'}
                  </Tag>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

/* ---------- Today Employee Status Panel ---------- */
const STATUS_CONFIG: Record<string, { color: string; label: string; bg: string; icon: React.ReactNode }> = {
  work:  { color: '#52c41a', label: '上班', bg: '#f6ffed', icon: <CheckCircleOutlined /> },
  rest:  { color: '#1677ff', label: '休息', bg: '#f0f5ff', icon: <PauseCircleOutlined /> },
  leave: { color: '#fa8c16', label: '请假', bg: '#fff7e6', icon: <ClockCircleOutlined /> },
};

function TodayEmployeeStatusPanel({
  data,
  loading,
  projectFilter,
  projectOptions,
  onProjectChange,
  selectedDate,
  onDateChange,
}: {
  data: TodayEmployeeRow[];
  loading: boolean;
  projectFilter: string | undefined;
  projectOptions: { value: string; label: string }[];
  onProjectChange: (v: string | undefined) => void;
  selectedDate: dayjs.Dayjs;
  onDateChange: (d: dayjs.Dayjs) => void;
}) {
  const isToday = selectedDate.isSame(dayjs(), 'day');
  const dateLabel = isToday ? '今日' : selectedDate.format('MM-DD');

  const summary = useMemo(() => {
    const working = data.filter(r => r.category === 'work').length;
    const resting = data.filter(r => r.category === 'rest').length;
    const onLeave = data.filter(r => r.category === 'leave').length;
    const unscheduled = data.filter(r => !r.category).length;
    const totalHours = data.reduce((sum, r) => sum + r.plannedHours, 0);
    return { working, resting, onLeave, unscheduled, total: data.length, totalHours };
  }, [data]);

  const columns = [
    {
      title: '员工',
      dataIndex: 'employeeName',
      width: 100,
      render: (name: string, record: TodayEmployeeRow) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{record.employeeNo}</div>
        </div>
      ),
    },
    {
      title: '部门',
      dataIndex: 'departmentName',
      width: 100,
      render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span>,
    },
    {
      title: `${dateLabel}状态`,
      dataIndex: 'category',
      width: 100,
      filters: [
        { text: '上班', value: 'work' },
        { text: '休息', value: 'rest' },
        { text: '请假', value: 'leave' },
        { text: '未排班', value: 'none' },
      ],
      onFilter: (value: any, record: TodayEmployeeRow) => {
        if (value === 'none') return !record.category;
        return record.category === value;
      },
      render: (cat: string | null) => {
        if (!cat) return <Tag color="default">未排班</Tag>;
        const cfg = STATUS_CONFIG[cat] || STATUS_CONFIG.work;
        return (
          <Tag icon={cfg.icon} color={cfg.color === '#52c41a' ? 'success' : cfg.color === '#1677ff' ? 'processing' : 'warning'}
            style={{ fontSize: 13 }}>
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: '班次',
      dataIndex: 'scheduleCodeName',
      width: 80,
      render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : <span style={{ color: '#d9d9d9' }}>-</span>,
    },
    {
      title: '工时',
      dataIndex: 'plannedHours',
      width: 70,
      sorter: (a: TodayEmployeeRow, b: TodayEmployeeRow) => a.plannedHours - b.plannedHours,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>{v}h</span> : <span style={{ color: '#d9d9d9' }}>-</span>,
    },
    {
      title: '所属项目',
      dataIndex: 'projectName',
      width: 120,
      render: (v: string | null) => v ? <span style={{ fontSize: 13 }}>{v}</span> : <span style={{ color: '#d9d9d9' }}>-</span>,
    },
  ];

  return (
    <Card
      size="small"
      style={{ ...cardStyle, marginTop: 16 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserOutlined style={{ color: '#1677ff' }} />
            <span style={{ fontWeight: 600 }}>📋 员工排班状态</span>
            <DatePicker
              value={selectedDate}
              onChange={(d) => d && onDateChange(d)}
              allowClear={false}
              size="small"
              style={{ width: 130 }}
            />
          </div>
          <Select
            allowClear
            placeholder="全部项目"
            value={projectFilter}
            onChange={onProjectChange}
            options={projectOptions}
            style={{ width: 200 }}
            size="small"
          />
        </div>
      }
    >
      {/* Summary stat bars */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: '上班', count: summary.working, color: '#52c41a', bg: '#f6ffed', icon: <CheckCircleOutlined /> },
          { label: '休息', count: summary.resting, color: '#1677ff', bg: '#f0f5ff', icon: <PauseCircleOutlined /> },
          { label: '请假', count: summary.onLeave, color: '#fa8c16', bg: '#fff7e6', icon: <ClockCircleOutlined /> },
          { label: '未排班', count: summary.unscheduled, color: '#999', bg: '#fafafa', icon: <QuestionCircleOutlined /> },
        ].map(item => (
          <Col xs={6} key={item.label}>
            <div style={{
              background: item.bg, borderRadius: 10, padding: '10px 12px',
              border: `1px solid ${item.color}22`, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${item.color}18`, color: item.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>{item.count}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{item.label}</div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Total bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '6px 12px', background: '#fafafa', borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: '#999' }}>合计 <strong style={{ color: '#333' }}>{summary.total}</strong> 人</span>
        <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
          {summary.total > 0 && (
            <>
              <div style={{ width: `${(summary.working / summary.total) * 100}%`, background: '#52c41a', transition: 'width 0.3s' }} />
              <div style={{ width: `${(summary.resting / summary.total) * 100}%`, background: '#1677ff', transition: 'width 0.3s' }} />
              <div style={{ width: `${(summary.onLeave / summary.total) * 100}%`, background: '#fa8c16', transition: 'width 0.3s' }} />
            </>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap' }}>
          {dateLabel}总工时 <strong style={{ color: '#333' }}>{summary.totalHours.toFixed(1)}h</strong>
        </span>
      </div>

      <Table
        rowKey="employeeId"
        dataSource={data}
        columns={columns as any}
        size="small"
        loading={loading}
        pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: ['8', '20', '50'], size: 'small', showTotal: (total) => `共 ${total} 人` }}
        scroll={{ x: 600 }}
        locale={{ emptyText: <Empty description="今天没有排班数据" /> }}
      />
    </Card>
  );
}
