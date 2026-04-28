import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Button, Typography, Tag, Spin, Empty, Select, Space,
  message, Tooltip,
} from 'antd';
import {
  LeftOutlined, RightOutlined, CalendarOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { supabase } from '@/app/lib/supabase/client';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { getScheduleMatrix } from '@/app/services/schedule.service';
import type { ScheduleCellRecord } from '@/app/types/schedule';

dayjs.locale('zh-cn');

const WEEKDAY_HEADERS = ['日', '一', '二', '三', '四', '五', '六'];

/* ========== Color palette ========== */
const SHIFT_PALETTE = [
  '#FF6B6B', '#FF8C42', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#87CEEB', '#F0E68C', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F8C471',
  '#D7BDE2', '#AED6F1', '#A3E4D7', '#FAD7A0', '#D5F5E3',
];

const REST_COLOR = '#F0F0F0';
const REST_TEXT = '#999';

const AVATAR_COLORS = [
  '#FF6B6B', '#FF8C42', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#E74C3C', '#8E44AD', '#2980B9', '#27AE60', '#F39C12',
  '#D35400', '#1ABC9C', '#3498DB', '#E67E22', '#9B59B6',
];

function getShiftColor(codeItem: any, index: number): string {
  if (!codeItem) return SHIFT_PALETTE[index % SHIFT_PALETTE.length];
  const extra = codeItem.extraConfig || {};
  const cat = extra.category;
  if (cat === 'rest' || cat === 'leave') return REST_COLOR;
  if (extra.color) return extra.color;
  return SHIFT_PALETTE[index % SHIFT_PALETTE.length];
}

function isRestCategory(codeItem: any): boolean {
  const cat = codeItem?.extraConfig?.category;
  return cat === 'rest' || cat === 'leave';
}

function getContrastColor(hexBg: string): string {
  try {
    const hex = hexBg.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? '#333' : '#fff';
  } catch {
    return '#333';
  }
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type EmployeeDetail = {
  id: string;
  fullName: string;
  employeeNo: string;
  departmentId?: string | null;
  departmentName?: string;
  channelId?: string | null;
  channelName?: string;
  mobileNumber?: string | null;
  onboardDate?: string | null;
  remark?: string | null;
};

type CodeItem = {
  id: string;
  itemName: string;
  itemCode: string;
  extraConfig?: Record<string, any> | null;
};

type ProjectOption = {
  projectId: string;
  projectName: string;
  versionId: string;
  versionName: string;
};

export function EmployeeScheduleDetailPage() {
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();
  const [searchParams] = useSearchParams();

  // URL params — optional, used when navigating from matrix
  const paramProjectId = searchParams.get('projectId') || '';
  const paramVersionId = searchParams.get('versionId') || '';
  const monthParam = searchParams.get('month') || '';

  const [currentMonth, setCurrentMonth] = useState<Dayjs>(
    monthParam ? dayjs(monthParam + '-01') : dayjs().startOf('month')
  );
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [schedules, setSchedules] = useState<ScheduleCellRecord[]>([]);
  const [codeItems, setCodeItems] = useState<CodeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Project filter state
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(paramProjectId);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(paramVersionId);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // Load employee detail
  const loadEmployee = useCallback(async () => {
    if (!employeeId) return;
    try {
      const { data, error } = await supabase
        .from('employee')
        .select('id, full_name, employee_no, department_id, channel_id, mobile_number, onboard_date, remark')
        .eq('id', employeeId)
        .limit(1)
        .single();
      if (error) throw error;

      let departmentName = '';
      if (data.department_id) {
        const { data: dept } = await supabase
          .from('department')
          .select('department_name')
          .eq('id', data.department_id)
          .limit(1)
          .single();
        departmentName = dept?.department_name || '';
      }

      let channelName = '';
      if (data.channel_id) {
        const { data: ch } = await supabase
          .from('channel')
          .select('channel_name')
          .eq('id', data.channel_id)
          .limit(1)
          .single();
        channelName = ch?.channel_name || '';
      }

      setEmployee({
        id: data.id,
        fullName: data.full_name,
        employeeNo: data.employee_no,
        departmentId: data.department_id,
        departmentName,
        channelId: data.channel_id,
        channelName,
        mobileNumber: data.mobile_number,
        onboardDate: data.onboard_date,
        remark: data.remark,
      });
    } catch (err) {
      message.error(getErrorMessage(err, '加载员工信息失败'));
    }
  }, [employeeId]);

  // Load projects that this employee has schedules in
  const loadEmployeeProjects = useCallback(async () => {
    if (!employeeId) return;
    setProjectsLoading(true);
    try {
      // Step 1: Get distinct version IDs for this employee
      const { data: scheduleRows } = await supabase
        .from('schedule')
        .select('schedule_version_id')
        .eq('employee_id', employeeId)
        .limit(500);

      if (!scheduleRows || scheduleRows.length === 0) {
        setProjectOptions([]);
        setProjectsLoading(false);
        return;
      }

      const versionIds = [...new Set(scheduleRows.map(r => r.schedule_version_id))];

      // Step 2: Get version details — only active versions
      const { data: versions } = await supabase
        .from('schedule_version')
        .select('id, version_no, project_id, is_active')
        .in('id', versionIds)
        .eq('is_active', true);

      if (!versions || versions.length === 0) {
        setProjectOptions([]);
        setProjectsLoading(false);
        return;
      }

      // Step 3: Get project names
      const projectIds = [...new Set(versions.map((v: any) => v.project_id))];
      const { data: projects } = await supabase
        .from('project')
        .select('id, project_name')
        .in('id', projectIds);

      const projectNameMap: Record<string, string> = {};
      (projects || []).forEach((p: any) => { projectNameMap[p.id] = p.project_name; });

      const options: ProjectOption[] = versions.map((v: any) => ({
        projectId: v.project_id,
        projectName: projectNameMap[v.project_id] || v.project_id.substring(0, 6),
        versionId: v.id,
        versionName: v.version_no || v.id.substring(0, 8),
      }));

      // Sort by project name
      options.sort((a, b) => a.projectName.localeCompare(b.projectName));
      setProjectOptions(options);
    } catch (err) {
      console.error('Failed to load employee projects:', err);
    } finally {
      setProjectsLoading(false);
    }
  }, [employeeId]);

  // Load schedule code items
  const loadCodeItems = useCallback(async () => {
    try {
      const { data: dictTypes } = await supabase
        .from('dict_type')
        .select('id, type_code')
        .order('sort_order');
      const schedType = (dictTypes || []).find(
        (t: any) => t.type_code === 'schedule_code' || t.type_code === 'shift_code' || t.type_code === 'schedule_type'
      );
      if (!schedType) return;

      const { data: items } = await supabase
        .from('dict_item')
        .select('id, item_name, item_code, extra_config')
        .eq('dict_type_id', schedType.id)
        .order('sort_order');

      setCodeItems(
        (items || []).map((r: any) => ({
          id: r.id,
          itemName: r.item_name,
          itemCode: r.item_code,
          extraConfig: r.extra_config,
        }))
      );
    } catch (err) {
      console.error('Failed to load code items:', err);
    }
  }, []);

  // Load schedule data
  const loadSchedules = useCallback(async () => {
    if (!employeeId || !selectedProjectId || !selectedVersionId) {
      setSchedules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await getScheduleMatrix({
        projectId: selectedProjectId,
        scheduleVersionId: selectedVersionId,
        scheduleMonth: currentMonth.format('YYYY-MM-DD'),
      });
      // Filter to this employee only
      setSchedules(rows.filter(r => r.employeeId === employeeId));
    } catch (err) {
      message.error(getErrorMessage(err, '加载排班数据失败'));
    } finally {
      setLoading(false);
    }
  }, [employeeId, selectedProjectId, selectedVersionId, currentMonth]);

  useEffect(() => {
    loadEmployee();
    loadCodeItems();
    loadEmployeeProjects();
  }, [loadEmployee, loadCodeItems, loadEmployeeProjects]);

  // Auto-select project/version when options load
  useEffect(() => {
    if (projectOptions.length === 0) return;
    // If URL had projectId and it exists in options, use it
    if (paramProjectId && projectOptions.some(o => o.projectId === paramProjectId)) {
      setSelectedProjectId(paramProjectId);
      // If URL also had versionId and it matches, use it
      if (paramVersionId && projectOptions.some(o => o.versionId === paramVersionId)) {
        setSelectedVersionId(paramVersionId);
      } else {
        // Use first version for that project
        const firstVersion = projectOptions.find(o => o.projectId === paramProjectId);
        if (firstVersion) setSelectedVersionId(firstVersion.versionId);
      }
    } else if (!selectedProjectId || !projectOptions.some(o => o.projectId === selectedProjectId)) {
      // Auto-select first available
      setSelectedProjectId(projectOptions[0].projectId);
      setSelectedVersionId(projectOptions[0].versionId);
    }
  }, [projectOptions]);
  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Unique projects for the project-level selector
  const uniqueProjects = useMemo(() => {
    const map = new Map<string, string>();
    projectOptions.forEach(o => { if (!map.has(o.projectId)) map.set(o.projectId, o.projectName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [projectOptions]);

  // Versions for the selected project
  const versionsForProject = useMemo(() => {
    return projectOptions.filter(o => o.projectId === selectedProjectId);
  }, [projectOptions, selectedProjectId]);

  // Handle project change
  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    // Auto-select first version of this project
    const versions = projectOptions.filter(o => o.projectId === projectId);
    if (versions.length > 0) {
      setSelectedVersionId(versions[0].versionId);
    }
  };

  // ===== Computed =====
  const codeColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    codeItems.forEach((c, i) => { m[c.id] = getShiftColor(c, i); });
    return m;
  }, [codeItems]);

  const codeMap = useMemo(() => {
    const m: Record<string, CodeItem> = {};
    codeItems.forEach(c => { m[c.id] = c; });
    return m;
  }, [codeItems]);

  const scheduleMap = useMemo(() => {
    const m = new Map<string, ScheduleCellRecord>();
    schedules.forEach(s => m.set(s.scheduleDate, s));
    return m;
  }, [schedules]);

  // Shift count statistics
  const shiftStats = useMemo(() => {
    const counts: Record<string, number> = {};
    schedules.forEach(s => {
      counts[s.scheduleCodeDictItemId] = (counts[s.scheduleCodeDictItemId] || 0) + 1;
    });
    return counts;
  }, [schedules]);

  // Calendar grid generation
  const calendarGrid = useMemo(() => {
    const firstDay = currentMonth.startOf('month');
    const daysInMonth = currentMonth.daysInMonth();

    const startDow = firstDay.day();
    const rows: (Dayjs | null)[][] = [];
    let currentRow: (Dayjs | null)[] = [];

    for (let i = 0; i < startDow; i++) {
      currentRow.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      currentRow.push(currentMonth.date(d));
      if (currentRow.length === 7) {
        rows.push(currentRow);
        currentRow = [];
      }
    }

    if (currentRow.length > 0) {
      while (currentRow.length < 7) {
        currentRow.push(null);
      }
      rows.push(currentRow);
    }

    return rows;
  }, [currentMonth]);

  const todayStr = dayjs().format('YYYY-MM-DD');

  const usedCodeItems = useMemo(() => {
    return codeItems.filter(c => shiftStats[c.id]);
  }, [codeItems, shiftStats]);

  const navigateMonth = (dir: number) => {
    setCurrentMonth(prev => prev.add(dir, 'month'));
  };

  // Current project + version labels
  const currentProjectName = uniqueProjects.find(p => p.id === selectedProjectId)?.name || '';
  const currentVersionName = versionsForProject.find(v => v.versionId === selectedVersionId)?.versionName || '';

  if (!employeeId) {
    return <Empty description="缺少员工信息" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 0', marginBottom: 16,
        borderBottom: '1px solid #f0f0f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={<LeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ fontSize: 14, color: '#666' }}
          />
          <CalendarOutlined style={{ fontSize: 18, color: '#45B7D1' }} />
          <Typography.Text strong style={{ fontSize: 16 }}>
            员工排班详情
          </Typography.Text>
        </div>

        {/* Project & Version filter */}
        <Space size={8}>
          <FilterOutlined style={{ color: '#999' }} />
          <Select
            size="small"
            style={{ minWidth: 160 }}
            placeholder="选择项目"
            loading={projectsLoading}
            value={selectedProjectId || undefined}
            onChange={handleProjectChange}
            options={uniqueProjects.map(p => ({ label: p.name, value: p.id }))}
            showSearch
            optionFilterProp="label"
          />
          {versionsForProject.length > 1 && (
            <Select
              size="small"
              style={{ minWidth: 140 }}
              placeholder="选择版本"
              value={selectedVersionId || undefined}
              onChange={(v) => setSelectedVersionId(v)}
              options={versionsForProject.map(v => ({ label: v.versionName, value: v.versionId }))}
            />
          )}
        </Space>
      </div>

      {loading && !employee ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          gap: 24,
          minHeight: 0,
          overflow: 'auto',
        }}>
          {/* ===== Left: Employee Info Card ===== */}
          <div style={{
            width: 300,
            flexShrink: 0,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}>
            {/* Avatar */}
            {employee && (
              <>
                <div style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${getAvatarColor(employee.fullName)}, ${getAvatarColor(employee.fullName + '1')})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 28,
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>
                  {employee.fullName[0]}
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#333' }}>
                    {employee.fullName}
                  </div>
                  <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
                    {employee.employeeNo}{employee.departmentName ? ` · ${employee.departmentName}` : ''}
                  </div>
                </div>

                {/* Info list */}
                <div style={{
                  width: '100%',
                  borderTop: '1px solid #f5f5f5',
                  paddingTop: 16,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <InfoRow label="部门" value={employee.departmentName || '-'} />
                    <InfoRow label="渠道" value={employee.channelName || '-'} />
                    <InfoRow label="手机" value={employee.mobileNumber || '-'} />
                    <InfoRow label="入职时间" value={employee.onboardDate || '-'} />
                    {currentProjectName && <InfoRow label="当前项目" value={currentProjectName} />}
                    {currentVersionName && <InfoRow label="排班版本" value={currentVersionName} />}
                  </div>
                </div>

                {/* Shift stats */}
                <div style={{
                  width: '100%',
                  borderTop: '1px solid #f5f5f5',
                  paddingTop: 16,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 12 }}>
                    本月班次统计
                  </div>
                  {usedCodeItems.length === 0 ? (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>暂无排班数据</Typography.Text>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {usedCodeItems.map(c => {
                        const bg = codeColorMap[c.id];
                        const isRest = isRestCategory(c);
                        return (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Tag style={{
                              backgroundColor: bg,
                              color: isRest ? REST_TEXT : getContrastColor(bg),
                              border: 'none',
                              borderRadius: 6,
                              padding: '2px 10px',
                              fontSize: 13,
                              fontWeight: 600,
                            }}>
                              {c.itemName || c.itemCode}
                            </Tag>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>
                              {shiftStats[c.id]} 天
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Total hours */}
                <div style={{
                  width: '100%',
                  borderTop: '1px solid #f5f5f5',
                  paddingTop: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: 14, color: '#666' }}>本月总工时</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#45B7D1' }}>
                    {schedules.reduce((sum, s) => {
                      const code = codeMap[s.scheduleCodeDictItemId];
                      const hours = Number(code?.extraConfig?.standard_hours || s.plannedHours || 0);
                      const cat = code?.extraConfig?.category;
                      return sum + (cat === 'rest' || cat === 'leave' ? 0 : hours);
                    }, 0)}h
                  </span>
                </div>
              </>
            )}
          </div>

          {/* ===== Right: Calendar View ===== */}
          <div style={{
            flex: 1,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            padding: 24,
            minWidth: 0,
            overflow: 'auto',
            position: 'relative',
          }}>
            {/* Calendar header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {currentMonth.format('YYYY年M月')}排班
                </Typography.Title>
                <Button
                  type="text" size="small" icon={<LeftOutlined />}
                  onClick={() => navigateMonth(-1)}
                  style={{ borderRadius: 8 }}
                />
                <Button
                  type="text" size="small" icon={<RightOutlined />}
                  onClick={() => navigateMonth(1)}
                  style={{ borderRadius: 8 }}
                />
                <Button
                  size="small"
                  onClick={() => setCurrentMonth(dayjs().startOf('month'))}
                  style={{ borderRadius: 16, fontSize: 12 }}
                >
                  本月
                </Button>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {codeItems.map(c => {
                  const bg = codeColorMap[c.id];
                  const isRest = isRestCategory(c);
                  return (
                    <Tag key={c.id} style={{
                      backgroundColor: bg,
                      color: isRest ? REST_TEXT : getContrastColor(bg),
                      border: 'none',
                      borderRadius: 6,
                      padding: '1px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: '22px',
                    }}>
                      {c.itemName || c.itemCode}
                    </Tag>
                  );
                })}
              </div>
            </div>

            {/* No project selected hint */}
            {!selectedProjectId && projectOptions.length === 0 && !projectsLoading && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <Empty description="该员工暂无排班记录" />
              </div>
            )}

            {/* Calendar grid */}
            {selectedProjectId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Day-of-week header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 0,
                  marginBottom: 4,
                }}>
                  {WEEKDAY_HEADERS.map((label, i) => (
                    <div key={i} style={{
                      textAlign: 'center',
                      padding: '8px 0',
                      fontSize: 14,
                      fontWeight: 600,
                      color: i === 0 || i === 6 ? '#FF8C42' : '#666',
                    }}>
                      {label}
                    </div>
                  ))}
                </div>

                {/* Calendar rows */}
                {calendarGrid.map((row, rowIdx) => (
                  <div key={rowIdx} style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 4,
                    marginBottom: 4,
                  }}>
                    {row.map((day, colIdx) => {
                      if (!day) {
                        return <div key={colIdx} style={{ minHeight: 80 }} />;
                      }

                      const dateStr = day.format('YYYY-MM-DD');
                      const schedule = scheduleMap.get(dateStr);
                      const code = schedule ? codeMap[schedule.scheduleCodeDictItemId] : null;
                      const isRest = isRestCategory(code);
                      const isToday = dateStr === todayStr;
                      const isWE = day.day() === 0 || day.day() === 6;

                      const bg = schedule
                        ? codeColorMap[schedule.scheduleCodeDictItemId] || '#eee'
                        : 'transparent';
                      const textColor = isRest ? REST_TEXT : (schedule ? getContrastColor(bg) : '#ccc');

                      const extra = code?.extraConfig || {};
                      const timeStr = (extra.start_time || '').slice(0, 5);

                      return (
                        <Tooltip
                          key={colIdx}
                          title={schedule && code ? (
                            <div style={{ fontSize: 12 }}>
                              <div><b>{code.itemName || code.itemCode}</b></div>
                              {timeStr && <div>开始: {timeStr}</div>}
                              <div>工时: {code?.extraConfig?.standard_hours ?? schedule.plannedHours ?? 0}h</div>
                            </div>
                          ) : null}
                          mouseEnterDelay={0.3}
                        >
                          <div style={{
                            minHeight: 80,
                            borderRadius: 10,
                            backgroundColor: schedule ? bg : (isToday ? '#FFF5F5' : isWE ? '#FAFAFA' : '#FAFCFF'),
                            border: isToday ? '2px solid #FF6B6B' : '1px solid #f0f0f0',
                            padding: '6px 8px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            cursor: 'default',
                            transition: 'all 0.15s ease',
                            position: 'relative',
                          }}>
                            {/* Date number */}
                            <div style={{
                              fontSize: 15,
                              fontWeight: isToday ? 800 : 600,
                              color: schedule
                                ? textColor
                                : (isToday ? '#FF6B6B' : isWE ? '#FF8C42' : '#333'),
                              lineHeight: 1.2,
                            }}>
                              {day.date()}
                            </div>

                            {/* Shift code name */}
                            {schedule && code ? (
                              <>
                                <div style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: textColor,
                                  lineHeight: 1.3,
                                }}>
                                  {code.itemName || code.itemCode}
                                </div>
                                {timeStr && !isRest && (
                                  <div style={{
                                    fontSize: 11,
                                    color: textColor,
                                    opacity: 0.85,
                                    lineHeight: 1.2,
                                  }}>
                                    {timeStr}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: 12, color: '#ddd', marginTop: 4 }}>-</div>
                            )}
                          </div>
                        </Tooltip>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {loading && (
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(255,255,255,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 16,
              }}>
                <Spin />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Utility component for employee info rows */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#999' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#333', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
