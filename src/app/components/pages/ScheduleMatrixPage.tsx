import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Select, DatePicker, Button, Space, Typography, Table, Tag, message,
  Modal, Form, Card, Tooltip, Dropdown, InputNumber,
  Empty, Alert, Input, Radio, Popover, Segmented, Badge,
} from 'antd';
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, CopyOutlined,
  ClearOutlined, CalendarOutlined,
  TeamOutlined, FieldTimeOutlined,
  FormatPainterOutlined, CloseOutlined,
  MoreOutlined, SearchOutlined, LeftOutlined, RightOutlined,
  CheckOutlined, HighlightOutlined, SwapOutlined, DragOutlined,
  WarningOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { getErrorMessage } from '@/app/lib/supabase/errors';
// useDict no longer needed — shift_type merged into schedule_code
import { useScheduleMatrix } from '@/app/hooks/useScheduleMatrix';
import {
  bulkUpsertScheduleCells,
  checkScheduleConflicts,
  deleteScheduleRecordsByIds,
  deleteSingleScheduleRecord,
  ensureConflictFree,
  resolveShiftTypeDictItemId,
} from '@/app/services/schedule.service';
import { validateScheduleBatch, type ScheduleViolation, type ValidationResult } from '@/app/services/labor-rule.service';
import type { ScheduleCellChange, ScheduleCellRecord } from '@/app/types/schedule';

dayjs.locale('zh-cn');

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const CELL_HEIGHT = 52;

/* ========== Vibrant color palette for shift codes ========== */
const SHIFT_PALETTE = [
  '#FF6B6B', '#FF8C42', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#87CEEB', '#F0E68C', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F8C471',
  '#D7BDE2', '#AED6F1', '#A3E4D7', '#FAD7A0', '#D5F5E3',
];

const REST_COLOR = '#F0F0F0';
const REST_TEXT = '#999';

function getShiftColor(codeItem: any, index: number): string {
  if (!codeItem) return SHIFT_PALETTE[index % SHIFT_PALETTE.length];
  const extra = codeItem.extraConfig || {};
  const cat = extra.category;
  if (cat === 'rest' || cat === 'leave') return REST_COLOR;
  if (extra.color) return extra.color;
  // Use palette based on stable index
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

/* ======== Avatar color from name ======== */
const AVATAR_COLORS = [
  '#FF6B6B', '#FF8C42', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#E74C3C', '#8E44AD', '#2980B9', '#27AE60', '#F39C12',
  '#D35400', '#1ABC9C', '#3498DB', '#E67E22', '#9B59B6',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function ScheduleMatrixPage() {
  const navigate = useNavigate();
  const {
    projects,
    versions,
    departments,
    allEmployees,
    codeItems,
    selectedProject,
    setSelectedProject,
    selectedVersion,
    selectedMonth,
    setSelectedMonth,
    selectedDept,
    setSelectedDept,
    schedules,
    setSchedules,
    loading,
    dataLoaded,
    error,
    refreshMatrix,
    handleVersionChange,
  } = useScheduleMatrix();

  // shift_type is now merged into schedule_code, no need for separate dict

  // ===== View Mode =====
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [weekStart, setWeekStart] = useState(() => selectedMonth.startOf('month').startOf('week'));
  const [selectedDay, setSelectedDay] = useState(() => dayjs());

  // ===== Edit Mode =====
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // ===== Brush Mode: select a code, then click cells to paint =====
  const [brushCodeId, setBrushCodeId] = useState<string | null>(null);

  // ===== Drag-to-Swap =====
  const [dragSource, setDragSource] = useState<{ empId: string; day: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ empId: string; day: number } | null>(null);

  // ===== Search =====
  const [searchText, setSearchText] = useState('');

  // ===== Batch =====
  const [batchModal, setBatchModal] = useState(false);
  const [batchMode, setBatchMode] = useState<'fill' | 'clear'>('fill');
  const [batchForm] = Form.useForm();

  // ===== Labor Rule Violations =====
  const [violations, setViolations] = useState<ValidationResult | null>(null);
  const [violationModalOpen, setViolationModalOpen] = useState(false);

  // Shared validation runner — used on data load and on exit edit
  const runLaborValidation = useCallback(async (showModal = false) => {
    if (!selectedProject || schedules.length === 0) return;
    try {
      const entries = schedules.map(s => {
        const cItem = codeItems.find(c => c.id === s.scheduleCodeDictItemId);
        const extra = cItem?.extraConfig || {};
        const cat = extra.category;
        return {
          employeeId: s.employeeId,
          employeeName: allEmployees.find(e => e.id === s.employeeId)?.fullName || s.employeeId.substring(0, 6),
          date: s.scheduleDate,
          plannedHours: s.plannedHours || 0,
          isWorkDay: cat === 'work',
          startTime: extra.start_time || '',
          endTime: extra.end_time || '',
        };
      });
      const result = await validateScheduleBatch(entries, selectedProject);
      if (!result.passed || result.softViolations.length > 0) {
        setViolations(result);
        if (showModal) setViolationModalOpen(true);
      } else {
        setViolations(null);
      }
    } catch {
      // Ignore validation errors silently
    }
  }, [selectedProject, schedules, codeItems, allEmployees]);

  // Auto-run validation when data finishes loading
  useEffect(() => {
    if (dataLoaded && schedules.length > 0) {
      runLaborValidation(false);
    }
  }, [dataLoaded, schedules, runLaborValidation]);

  // ===== Scroll control =====
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const scrollTable = useCallback((direction: 'left' | 'right') => {
    const container = tableWrapRef.current;
    if (!container) return;
    // Find ant-table-body (the scrollable element inside Ant Design Table)
    const scrollEl = container.querySelector('.ant-table-body') || container.querySelector('.ant-table-content');
    if (scrollEl) {
      const step = 300; // pixels to scroll per click
      scrollEl.scrollBy({ left: direction === 'right' ? step : -step, behavior: 'smooth' });
    }
  }, []);

  // ===== Computed =====
  const daysInMonth = selectedMonth.daysInMonth();
  const allDays = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const todayStr = dayjs().format('YYYY-MM-DD');

  // Visible days based on view mode
  const visibleDays = useMemo(() => {
    if (viewMode === 'month') return allDays;
    if (viewMode === 'week') {
      const result: number[] = [];
      for (let i = 0; i < 7; i++) {
        const d = weekStart.add(i, 'day');
        if (d.month() === selectedMonth.month() && d.year() === selectedMonth.year()) {
          result.push(d.date());
        }
      }
      return result;
    }
    // day view
    const dayNum = selectedDay.date();
    if (selectedDay.month() === selectedMonth.month() && selectedDay.year() === selectedMonth.year()) {
      return [dayNum];
    }
    return [1];
  }, [viewMode, allDays, weekStart, selectedDay, selectedMonth]);

  // Use allDays for matrix data (so stats are correct), visibleDays for columns
  const days = allDays;

  // Build a stable color map for code items
  const codeColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    codeItems.forEach((c, i) => { m[c.id] = getShiftColor(c, i); });
    return m;
  }, [codeItems]);

  const codeMap = useMemo(() => {
    const m: Record<string, any> = {};
    codeItems.forEach(c => { m[c.id] = c; });
    return m;
  }, [codeItems]);

  // Map: schedule code id → time info (read directly from schedule_code's extra_config)
  const shiftTimeMap = useMemo(() => {
    const result: Record<string, { startTime: string; endTime: string; plannedHours: number | null }> = {};
    codeItems.forEach(c => {
      const extra = c.extraConfig || {};
      result[c.id] = {
        startTime: extra.start_time || '',
        endTime: extra.end_time || '',
        plannedHours: extra.planned_hours ?? null,
      };
    });
    return result;
  }, [codeItems]);

  // Resolve planned hours: schedule_code.planned_hours → standard_hours → 8
  function resolveHours(codeId: string, overrideHours?: number | null): number {
    if (overrideHours != null && overrideHours > 0) return overrideHours;
    const linked = shiftTimeMap[codeId];
    if (linked?.plannedHours != null) return linked.plannedHours;
    const codeItem = codeMap[codeId];
    return codeItem?.extraConfig?.standard_hours ?? 8;
  }

  const deptMap = useMemo(
    () => Object.fromEntries(departments.map(d => [d.id, d.departmentName])),
    [departments]
  );

  const scheduleMap = useMemo(() => {
    const m = new Map<string, ScheduleCellRecord>();
    schedules.forEach(s => m.set(`${s.employeeId}_${s.scheduleDate}`, s));
    return m;
  }, [schedules]);

  const involvedEmpIds = useMemo(() => new Set(schedules.map(s => s.employeeId)), [schedules]);

  const filteredEmployees = useMemo(() => {
    let emps = allEmployees;
    // Filter by department
    if (selectedDept) emps = emps.filter(e => e.departmentId === selectedDept);
    // Filter by search text
    if (searchText.trim()) {
      const keyword = searchText.trim().toLowerCase();
      emps = emps.filter(e => e.fullName.toLowerCase().includes(keyword) || (e.employeeNo || '').toLowerCase().includes(keyword));
    }
    return emps;
  }, [allEmployees, selectedDept, searchText]);

  // matrix rows
  const matrixData = useMemo(() => {
    return filteredEmployees.map(emp => {
      const row: any = {
        key: emp.id, employee_id: emp.id,
        full_name: emp.fullName, employee_no: emp.employeeNo,
        department_name: deptMap[emp.departmentId || ''] || '-',
      };
      let work = 0, rest = 0, hours = 0;
      days.forEach(d => {
        const dateStr = selectedMonth.date(d).format('YYYY-MM-DD');
        const s = scheduleMap.get(`${emp.id}_${dateStr}`);
        row[`d${d}`] = s;
        if (s) {
          const cat = codeMap[s.scheduleCodeDictItemId]?.extraConfig?.category;
          if (cat === 'rest' || cat === 'leave') rest++; else work++;
          hours += Number(s.plannedHours) || 0;
        }
      });
      row._work = work; row._rest = rest; row._hours = hours;
      return row;
    });
  }, [filteredEmployees, days, selectedMonth, scheduleMap, codeMap, deptMap]);

  // Visible date strings for filtering stats by view mode
  const visibleDateSet = useMemo(() => {
    const set = new Set<string>();
    visibleDays.forEach(d => {
      set.add(selectedMonth.date(d).format('YYYY-MM-DD'));
    });
    return set;
  }, [visibleDays, selectedMonth]);

  // Schedules filtered to visible period
  const visibleSchedules = useMemo(() => {
    return schedules.filter(s => visibleDateSet.has(s.scheduleDate));
  }, [schedules, visibleDateSet]);

  // Shift code usage stats (filtered by visible period)
  const codeStats = useMemo(() => {
    const counts: Record<string, number> = {};
    visibleSchedules.forEach(s => {
      counts[s.scheduleCodeDictItemId] = (counts[s.scheduleCodeDictItemId] || 0) + 1;
    });
    return counts;
  }, [visibleSchedules]);

  const stats = useMemo(() => {
    if (!dataLoaded) return null;
    const total = filteredEmployees.length;
    // 已排班 = 员工在项目周期内每一天都有排班记录
    const totalDays = allDays.length;
    // 按员工统计已排班的不重复天数
    const empScheduledDays = new Map<string, Set<string>>();
    for (const s of visibleSchedules) {
      if (!empScheduledDays.has(s.employeeId)) {
        empScheduledDays.set(s.employeeId, new Set());
      }
      empScheduledDays.get(s.employeeId)!.add(s.scheduleDate);
    }
    // 只有排满所有天数的才算"已排班"
    let scheduled = 0;
    for (const emp of filteredEmployees) {
      const days = empScheduledDays.get(emp.id);
      if (days && days.size >= totalDays) scheduled++;
    }
    const unscheduled = total - scheduled;
    return { total, scheduled, unscheduled };
  }, [filteredEmployees, visibleSchedules, allDays, dataLoaded]);

  // Build project labels with disambiguation for same-name projects
  const projectLabels = useMemo(() => {
    const nameCount: Record<string, number> = {};
    projects.forEach(p => { nameCount[p.projectName] = (nameCount[p.projectName] || 0) + 1; });
    return Object.fromEntries(projects.map(p => {
      let label = p.projectName;
      if (nameCount[p.projectName] > 1 && (p.startDate || p.endDate)) {
        const s = p.startDate?.substring(0, 7) || '?';
        const e = p.endDate?.substring(0, 7) || '?';
        label = `${p.projectName}（${s} ~ ${e}）`;
      }
      return [p.id, label];
    }));
  }, [projects]);

  const selectedProjectName = useMemo(() => {
    return projectLabels[selectedProject || ''] || '';
  }, [projectLabels, selectedProject]);

  // ===== Quick assign: click cell in edit mode -> assign shift directly (optimistic update) =====
  async function quickAssign(empId: string, day: number, codeId: string) {
    if (!selectedVersion || !selectedProject) return;
    const dateStr = selectedMonth.date(day).format('YYYY-MM-DD');
    const emp = allEmployees.find(e => e.id === empId);
    const codeItem = codeMap[codeId];
    const plannedHours = resolveHours(codeId);
    const shiftTypeDictItemId = resolveShiftTypeDictItemId(codeItem);
    const mapKey = `${empId}_${dateStr}`;
    const existingRecord = scheduleMap.get(mapKey);

    // Optimistic: update local state immediately
    const optimisticRecord: ScheduleCellRecord = {
      id: existingRecord?.id || `__temp_${Date.now()}`,
      scheduleVersionId: selectedVersion,
      employeeId: empId,
      departmentId: emp?.departmentId,
      projectId: selectedProject,
      scheduleDate: dateStr,
      scheduleCodeDictItemId: codeId,
      shiftTypeDictItemId: shiftTypeDictItemId,
      plannedHours: plannedHours,
      sourceType: 'manual',
      remark: existingRecord?.remark,
    };

    setSchedules(prev => {
      const filtered = prev.filter(s => !(s.employeeId === empId && s.scheduleDate === dateStr));
      return [...filtered, optimisticRecord];
    });

    // Background save
    const change: ScheduleCellChange = {
      employeeId: empId,
      departmentId: emp?.departmentId,
      projectId: selectedProject,
      scheduleDate: dateStr,
      scheduleCodeDictItemId: codeId,
      shiftTypeDictItemId: shiftTypeDictItemId,
      plannedHours: plannedHours,
      sourceType: 'manual',
    };
    try {
      const results = await bulkUpsertScheduleCells({
        scheduleVersionId: selectedVersion,
        changes: [change],
      });
      // Replace temp ID with real database ID
      if (Array.isArray(results) && results.length > 0) {
        const realId = results[0].id;
        setSchedules(prev => prev.map(s =>
          s.employeeId === empId && s.scheduleDate === dateStr && s.id.startsWith('__temp_')
            ? { ...s, id: realId }
            : s
        ));
      }
    } catch (error) {
      message.error(getErrorMessage(error, '排班保存失败'));
      // Rollback: reload from server
      refreshMatrix();
    }
  }

  async function quickClear(empId: string, day: number) {
    if (!selectedVersion) return;
    const dateStr = selectedMonth.date(day).format('YYYY-MM-DD');
    const existing = scheduleMap.get(`${empId}_${dateStr}`);
    if (!existing) return;
    const removedId = existing.id;

    // Optimistic: remove from local state immediately
    setSchedules(prev => prev.filter(s => s.id !== removedId));

    // Background delete
    try {
      await deleteSingleScheduleRecord(removedId);
    } catch (error) {
      message.error(getErrorMessage(error, '清除失败'));
      // Rollback: reload from server
      refreshMatrix();
    }
  }

  // ===== Brush Paint: click a cell when brush is active =====
  function brushPaint(empId: string, day: number) {
    if (!brushCodeId || !selectedVersion || !selectedProject) return;
    quickAssign(empId, day, brushCodeId);
  }

  // ===== Drag-to-Swap: exchange shifts between two cells =====
  async function handleDragSwap(
    srcEmpId: string, srcDay: number,
    tgtEmpId: string, tgtDay: number
  ) {
    if (!selectedVersion || !selectedProject) return;
    if (srcEmpId === tgtEmpId && srcDay === tgtDay) return;

    const srcDate = selectedMonth.date(srcDay).format('YYYY-MM-DD');
    const tgtDate = selectedMonth.date(tgtDay).format('YYYY-MM-DD');
    const srcRecord = scheduleMap.get(`${srcEmpId}_${srcDate}`);
    const tgtRecord = scheduleMap.get(`${tgtEmpId}_${tgtDate}`);

    if (!srcRecord && !tgtRecord) return; // Both empty, nothing to swap

    const srcEmp = allEmployees.find(e => e.id === srcEmpId);
    const tgtEmp = allEmployees.find(e => e.id === tgtEmpId);

    // Optimistic: swap in local state
    setSchedules(prev => {
      let next = prev.filter(s =>
        !(s.employeeId === srcEmpId && s.scheduleDate === srcDate) &&
        !(s.employeeId === tgtEmpId && s.scheduleDate === tgtDate)
      );
      // Move src schedule to tgt position
      if (srcRecord) {
        next.push({
          ...srcRecord,
          id: tgtRecord?.id || `__swap_${Date.now()}_a`,
          employeeId: tgtEmpId,
          departmentId: tgtEmp?.departmentId,
          scheduleDate: tgtDate,
        });
      }
      // Move tgt schedule to src position
      if (tgtRecord) {
        next.push({
          ...tgtRecord,
          id: srcRecord?.id || `__swap_${Date.now()}_b`,
          employeeId: srcEmpId,
          departmentId: srcEmp?.departmentId,
          scheduleDate: srcDate,
        });
      }
      return next;
    });

    // Background save: upsert both positions
    try {
      const changes: ScheduleCellChange[] = [];
      if (srcRecord) {
        changes.push({
          employeeId: tgtEmpId,
          departmentId: tgtEmp?.departmentId,
          projectId: selectedProject,
          scheduleDate: tgtDate,
          scheduleCodeDictItemId: srcRecord.scheduleCodeDictItemId,
          shiftTypeDictItemId: srcRecord.shiftTypeDictItemId,
          plannedHours: srcRecord.plannedHours,
          sourceType: 'manual',
        });
      }
      if (tgtRecord) {
        changes.push({
          employeeId: srcEmpId,
          departmentId: srcEmp?.departmentId,
          projectId: selectedProject,
          scheduleDate: srcDate,
          scheduleCodeDictItemId: tgtRecord.scheduleCodeDictItemId,
          shiftTypeDictItemId: tgtRecord.shiftTypeDictItemId,
          plannedHours: tgtRecord.plannedHours,
          sourceType: 'manual',
        });
      }
      // If one side was empty, delete the original (skip if temp ID - not in DB yet)
      if (!tgtRecord && srcRecord && !srcRecord.id.startsWith('__temp_')) {
        await deleteSingleScheduleRecord(srcRecord.id);
      }
      if (!srcRecord && tgtRecord && !tgtRecord.id.startsWith('__temp_')) {
        await deleteSingleScheduleRecord(tgtRecord.id);
      }
      if (changes.length > 0) {
        const results = await bulkUpsertScheduleCells({
          scheduleVersionId: selectedVersion,
          changes,
        });
        // Replace temp/swap IDs with real database IDs
        if (Array.isArray(results)) {
          setSchedules(prev => prev.map(s => {
            const match = results.find(r => r.employeeId === s.employeeId && r.scheduleDate === s.scheduleDate);
            if (match && (s.id.startsWith('__swap_') || s.id.startsWith('__temp_'))) {
              return { ...s, id: match.id };
            }
            return s;
          }));
        }
      }
      message.success('班次交换成功');
    } catch (error) {
      message.error(getErrorMessage(error, '班次交换失败'));
      refreshMatrix();
    }
  }

  // ===== Row operations =====
  async function copyRow(empId: string) {
    if (!selectedVersion || !selectedProject) return;
    const empSchedules = schedules.filter(s => s.employeeId === empId);
    if (empSchedules.length === 0) { message.warning('暂无排班可复制'); return; }
    let lastDay = -1;
    for (let d = daysInMonth; d >= 1; d--) {
      if (scheduleMap.has(`${empId}_${selectedMonth.date(d).format('YYYY-MM-DD')}`)) { lastDay = d; break; }
    }
    if (lastDay === -1 || lastDay === daysInMonth) { message.info('无空余日期'); return; }
    const src = scheduleMap.get(`${empId}_${selectedMonth.date(lastDay).format('YYYY-MM-DD')}`)!;
    const emp = allEmployees.find(e => e.id === empId);
    const records: ScheduleCellChange[] = [];
    for (let d = lastDay + 1; d <= daysInMonth; d++) {
      const ds = selectedMonth.date(d).format('YYYY-MM-DD');
      if (!scheduleMap.has(`${empId}_${ds}`)) {
        records.push({
          employeeId: empId,
          departmentId: emp?.departmentId,
          projectId: selectedProject,
          scheduleDate: ds,
          scheduleCodeDictItemId: src.scheduleCodeDictItemId,
          shiftTypeDictItemId: src.shiftTypeDictItemId,
          plannedHours: src.plannedHours,
          sourceType: 'copy',
          remark: src.remark,
        });
      }
    }
    if (records.length === 0) { message.info('无空余日期'); return; }
    try {
      ensureConflictFree(await checkScheduleConflicts({
        scheduleVersionId: selectedVersion,
        changes: records,
      }));
      await bulkUpsertScheduleCells({
        scheduleVersionId: selectedVersion,
        changes: records,
      });
      message.success(`已延续 ${records.length} 天`);
      await refreshMatrix();
    } catch (error) {
      message.error(getErrorMessage(error, '延续排班失败'));
    }
  }

  async function clearRow(empId: string) {
    const ids = schedules.filter(s => s.employeeId === empId).map(s => s.id);
    if (ids.length === 0) { message.info('无排班记录'); return; }
    Modal.confirm({
      title: '确认清除', content: `将清除该员工本月 ${ids.length} 条排班`, okType: 'danger',
      onOk: async () => {
        try {
          await deleteScheduleRecordsByIds(ids);
          message.success('已清除');
          await refreshMatrix();
        } catch (error) {
          message.error(getErrorMessage(error, '清除排班失败'));
        }
      },
    });
  }

  // ===== Batch =====
  async function executeBatch() {
    try {
      setSaving(true);
      if (!selectedVersion || !selectedProject) {
        message.warning('请先选择项目和版本');
        return;
      }
      const values = await batchForm.validateFields();
      const empIds: string[] = values.employee_ids?.length > 0
        ? values.employee_ids
        : filteredEmployees.map(e => e.id);
      if (empIds.length === 0) { message.warning('没有目标员工'); return; }
      const dates: string[] = [];
      if (values.dateRange === 'custom' && values.customDateRange) {
        let cur = dayjs(values.customDateRange[0]);
        const endDay = dayjs(values.customDateRange[1]);
        while (cur.isBefore(endDay) || cur.isSame(endDay, 'day')) {
          dates.push(cur.format('YYYY-MM-DD'));
          cur = cur.add(1, 'day');
        }
      } else {
        days.forEach(d => {
          const dt = selectedMonth.date(d);
          const dow = dt.day();
          if (values.dateRange === 'weekday' && (dow === 0 || dow === 6)) return;
          if (values.dateRange === 'weekend' && dow !== 0 && dow !== 6) return;
          dates.push(dt.format('YYYY-MM-DD'));
        });
      }

      if (batchMode === 'clear') {
        const idsToDelete = schedules
          .filter(s => empIds.includes(s.employeeId) && dates.includes(s.scheduleDate))
          .map(s => s.id);
        if (idsToDelete.length === 0) { message.info('没有匹配的排班记录'); setBatchModal(false); return; }
        await deleteScheduleRecordsByIds(idsToDelete);
        message.success(`已清除 ${idsToDelete.length} 条记录`);
      } else {
        const codeItem = codeMap[values.schedule_code_dict_item_id];
        const records: ScheduleCellChange[] = [];
        for (const eid of empIds) {
          const emp = allEmployees.find(e => e.id === eid);
          for (const ds of dates) {
            if (!scheduleMap.has(`${eid}_${ds}`)) {
              records.push({
                employeeId: eid,
                departmentId: emp?.departmentId,
                projectId: selectedProject,
                scheduleDate: ds,
                scheduleCodeDictItemId: values.schedule_code_dict_item_id,
                shiftTypeDictItemId: resolveShiftTypeDictItemId(codeItem),
                plannedHours: resolveHours(values.schedule_code_dict_item_id, values.planned_hours),
                sourceType: 'batch',
              });
            }
          }
        }
        if (records.length === 0) { message.info('所有日期已有排班'); setBatchModal(false); return; }
        ensureConflictFree(await checkScheduleConflicts({
          scheduleVersionId: selectedVersion,
          changes: records,
        }));
        await bulkUpsertScheduleCells({
          scheduleVersionId: selectedVersion,
          changes: records,
        });
        message.success(`已创建 ${records.length} 条排班`);
      }
      setBatchModal(false);
      await refreshMatrix();
    } catch (e: any) { message.error(getErrorMessage(e, '批量操作失败')); }
    finally { setSaving(false); }
  }

  // ===== Build cell dropdown menu items =====
  function buildCellMenuItems(empId: string, day: number) {
    const dateStr = selectedMonth.date(day).format('YYYY-MM-DD');
    const existing = scheduleMap.get(`${empId}_${dateStr}`);
    const items: any[] = [];

    // "Clear" option
    items.push({
      key: '__clear',
      label: '清除',
      icon: <DeleteOutlined />,
      danger: true,
      disabled: !existing,
      onClick: () => quickClear(empId, day),
    });

    items.push({ type: 'divider' });

    // All code options
    codeItems.forEach(c => {
      const bg = codeColorMap[c.id];
      const isActive = existing?.scheduleCodeDictItemId === c.id;
      const extra = c.extraConfig || {};
      const startT = extra.start_time || '';
      const endT = extra.end_time || '';
      const timeStr = startT && endT ? `${startT.slice(0,5)}-${endT.slice(0,5)}` : '';
      items.push({
        key: c.id,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
            {isActive && <CheckOutlined style={{ color: '#1677ff', fontSize: 12 }} />}
            <span style={{ fontWeight: isActive ? 600 : 400 }}>{c.itemName || c.itemCode}</span>
            {timeStr && <span style={{ fontSize: 11, color: '#999' }}>{timeStr}</span>}
          </div>
        ),
        onClick: () => quickAssign(empId, day, c.id),
      });
    });

    return items;
  }

  // ===== Build columns =====
  const CELL_HEIGHT = 56;

  const columns = useMemo(() => {
    const cols: any[] = [
      {
        title: '员工', dataIndex: 'full_name', width: 130, fixed: 'left' as const,
        render: (name: string, record: any) => {
          const initial = name ? name[0] : '?';
          const avatarBg = getAvatarColor(name || '');
          const handleClick = () => {
            const params = new URLSearchParams();
            if (selectedProject) params.set('projectId', selectedProject);
            if (selectedVersion) params.set('versionId', selectedVersion);
            params.set('month', selectedMonth.format('YYYY-MM'));
            navigate(`/schedule/employee/${record.employee_id}?${params.toString()}`);
          };
          return (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', cursor: 'pointer' }}
              onClick={handleClick}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                backgroundColor: avatarBg, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 600, flexShrink: 0,
              }}>
                {initial}
              </div>
              <span style={{
                fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                color: '#1677ff',
              }}>
                {name}
              </span>
            </div>
          );
        },
      },
    ];

    const colWidth = viewMode === 'month' ? 90 : viewMode === 'week' ? 140 : 260;

    visibleDays.forEach(d => {
      const date = selectedMonth.date(d);
      const dow = date.day();
      const isWE = dow === 0 || dow === 6;
      const dateStr = date.format('YYYY-MM-DD');
      const isToday = dateStr === todayStr;

      cols.push({
        title: (
          <div style={{ textAlign: 'center', lineHeight: 1.2, userSelect: 'none' }}>
            <div style={{
              fontSize: viewMode === 'day' ? 16 : 14, fontWeight: isToday ? 700 : 500,
              color: isToday ? '#FF6B6B' : isWE ? '#FF8C42' : '#333',
            }}>{date.format('M月D日')}</div>
            <div style={{
              fontSize: viewMode === 'day' ? 13 : 11,
              color: isWE ? '#FF8C42' : '#999',
              fontWeight: isWE ? 500 : 400,
            }}>{WEEKDAY_LABELS[dow]}</div>
          </div>
        ),
        dataIndex: `d${d}`,
        width: colWidth,
        onHeaderCell: () => ({
          style: {
            padding: '6px 2px',
            background: isToday ? '#FFF5F5' : isWE ? '#FFFAF0' : undefined,
            borderBottom: isToday ? '3px solid #FF6B6B' : undefined,
          },
        }),
        onCell: () => ({
          style: { padding: 0 },
        }),
        render: (schedule: ScheduleCellRecord | undefined, record: any) => {
          const code = schedule ? codeMap[schedule.scheduleCodeDictItemId] : null;
          const isRest = isRestCategory(code);
          const bg = schedule ? codeColorMap[schedule.scheduleCodeDictItemId] || '#eee' : (isWE ? '#FAFAFA' : 'transparent');
          const textColor = isRest ? REST_TEXT : (schedule ? getContrastColor(bg) : '#ddd');
          const extra = code?.extraConfig || {};
          // Read start_time directly from schedule_code extra_config
          const timeStr = (extra.start_time || '').slice(0, 5);
          const label = code ? (code.itemName || code.itemCode || '') : '';

          const cellContent = (
            <div style={{
              height: CELL_HEIGHT,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: bg,
              borderRadius: 6,
              margin: 2,
              cursor: isEditing ? (brushCodeId ? 'crosshair' : 'pointer') : 'default',
              transition: 'all 0.15s ease',
              border: (isEditing && dragOver?.empId === record.employee_id && dragOver?.day === d)
                ? '2px dashed #1677ff'
                : isToday ? '2px solid #FF6B6B' : '1px solid transparent',
              userSelect: 'none',
              position: 'relative' as const,
              overflow: 'hidden',
              padding: '0 4px',
              opacity: (isEditing && dragSource?.empId === record.employee_id && dragSource?.day === d) ? 0.4 : 1,
            }}>
              {schedule ? (
                <>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: textColor,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: '100%', textAlign: 'center',
                  }}>
                    {label}
                  </div>
                  {timeStr && !isRest && (
                    <div style={{
                      fontSize: 11,
                      color: textColor,
                      opacity: 0.8,
                      lineHeight: 1.2,
                      marginTop: 1,
                      textAlign: 'center',
                    }}>
                      {timeStr}
                    </div>
                  )}
                  {/* Drag handle indicator in edit mode */}
                  {isEditing && !brushCodeId && (
                    <div style={{
                      position: 'absolute', top: 2, right: 3,
                      fontSize: 8, color: textColor, opacity: 0.35,
                    }}>
                      ⠿
                    </div>
                  )}
                  {/* 调班审批来源角标 */}
                  {schedule?.remark && schedule.remark.includes('调班审批') && (
                    <div style={{
                      position: 'absolute', top: 1, left: 1,
                      width: 0, height: 0,
                      borderLeft: '10px solid #fa8c16',
                      borderBottom: '10px solid transparent',
                    }} />
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: '#ddd' }}>-</div>
              )}
            </div>
          );

          // In edit mode: support brush click, drag-and-drop, or dropdown
          if (isEditing) {
            const empId = record.employee_id;

            // Wrap with drag/drop and click handlers
            return (
              <div
                draggable={!brushCodeId && !!schedule}
                onDragStart={(e) => {
                  if (brushCodeId) { e.preventDefault(); return; }
                  setDragSource({ empId, day: d });
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', `${empId}:${d}`);
                }}
                onDragEnd={() => {
                  setDragSource(null);
                  setDragOver(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOver({ empId, day: d });
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  if (!dragSource) return;
                  handleDragSwap(dragSource.empId, dragSource.day, empId, d);
                  setDragSource(null);
                }}
                onClick={(e) => {
                  // Brush mode: click to paint
                  if (brushCodeId) {
                    e.stopPropagation();
                    brushPaint(empId, d);
                    return;
                  }
                }}
              >
                {brushCodeId ? (
                  cellContent
                ) : (
                  <Dropdown
                    menu={{ items: buildCellMenuItems(empId, d) }}
                    trigger={['click']}
                    placement="bottomLeft"
                  >
                    {cellContent}
                  </Dropdown>
                )}
              </div>
            );
          }

          // View mode: tooltip on hover
          if (schedule) {
            const timeDesc = extra.start_time && extra.end_time ? `${extra.start_time} - ${extra.end_time}` : null;
            return (
              <Tooltip
                title={<div style={{ fontSize: 12 }}>
                  <div><b>{code?.itemName || '?'}</b></div>
                  {timeDesc && <div style={{ color: '#d9d9d9' }}>{timeDesc}</div>}
                  <div>工时 {schedule.plannedHours ?? 0}h</div>
                  {schedule.remark && <div style={{ color: '#faad14', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 4 }}>{schedule.remark}</div>}
                </div>}
                mouseEnterDelay={0.3}
              >
                {cellContent}
              </Tooltip>
            );
          }
          return cellContent;
        },
      });
    });

    // Row ops column — only in edit mode
    if (isEditing) {
      cols.push({
        title: '', key: 'op', width: 40, fixed: 'right' as const,
        render: (_: any, r: any) => (
          <Dropdown menu={{ items: [
            { key: 'copy', label: '延续排班', icon: <CopyOutlined />, onClick: () => copyRow(r.employee_id) },
            { key: 'clear', label: '清除整行', icon: <ClearOutlined />, danger: true, onClick: () => clearRow(r.employee_id) },
          ]}} trigger={['click']}>
            <Button type="text" size="small" icon={<MoreOutlined />} style={{ width: 28, height: 28 }} />
          </Dropdown>
        ),
      });
    }

    return cols;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDays, viewMode, selectedMonth, todayStr, codeMap, codeColorMap, isEditing, selectedDept, scheduleMap, shiftTimeMap, brushCodeId, dragSource, dragOver]);

  // ===== Render =====
  const colWidth = viewMode === 'month' ? 90 : viewMode === 'week' ? 140 : 260;
  const scrollX = 130 + colWidth * visibleDays.length + (isEditing ? 40 : 0) + 20;

  // Week label for toolbar
  const weekLabel = useMemo(() => {
    if (viewMode !== 'week') return '';
    const end = weekStart.add(6, 'day');
    return `${weekStart.format('M/D')} - ${end.format('M/D')}`;
  }, [viewMode, weekStart]);

  const navigateWeek = (dir: number) => {
    setWeekStart(prev => prev.add(dir * 7, 'day'));
  };
  const navigateDay = (dir: number) => {
    setSelectedDay(prev => prev.add(dir, 'day'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      {/* ===== Top Header Bar ===== */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '8px 0', marginBottom: 8,
        borderBottom: '1px solid #f0f0f0',
      }}>
        <Button
          type="text"
          icon={<LeftOutlined />}
          onClick={() => navigate('/schedule-version')}
          style={{ fontSize: 14, color: '#666' }}
        />
        <Typography.Text strong style={{ fontSize: 16 }}>
          排班调整
        </Typography.Text>

        <Select
          placeholder="选择项目"
          style={{ width: 180 }}
          value={selectedProject}
          onChange={setSelectedProject}
          showSearch optionFilterProp="label"
          options={projects.map(p => ({ label: projectLabels[p.id] || p.projectName, value: p.id }))}
          variant="borderless"
        />

        <DatePicker picker="month" value={selectedMonth}
          onChange={v => v && setSelectedMonth(v)}
          style={{ width: 120 }}
          variant="borderless"
        />

        <Select
          placeholder={selectedProject ? '选择版本' : '先选项目'}
          style={{ width: 160 }}
          value={selectedVersion}
          onChange={handleVersionChange}
          options={versions.map(v => ({
            label: `v${v.versionNo} · ${v.generationType === 'manual' ? '手工' : v.generationType === 'template' ? '模板' : v.generationType === 'shift_change' ? '调班' : v.generationType}`,
            value: v.id,
          }))}
          disabled={!selectedProject}
          variant="borderless"
        />

        <Input
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="搜索员工..."
          allowClear
          style={{ width: 160 }}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          variant="borderless"
        />

        {/* ===== View Mode Switcher ===== */}
        <Segmented
          value={viewMode}
          onChange={(val) => {
            const v = val as 'month' | 'week' | 'day';
            setViewMode(v);
            if (v === 'week') {
              // Set weekStart to the week containing today or start of selectedMonth
              const ref = selectedMonth.month() === dayjs().month() && selectedMonth.year() === dayjs().year()
                ? dayjs() : selectedMonth.startOf('month');
              setWeekStart(ref.startOf('week'));
            }
            if (v === 'day') {
              const ref = selectedMonth.month() === dayjs().month() && selectedMonth.year() === dayjs().year()
                ? dayjs() : selectedMonth.startOf('month');
              setSelectedDay(ref);
            }
          }}
          options={[
            { label: '月', value: 'month', icon: <CalendarOutlined /> },
            { label: '周', value: 'week', icon: <FieldTimeOutlined /> },
            { label: '日', value: 'day', icon: <CalendarOutlined /> },
          ]}
          style={{
            borderRadius: 20,
            padding: 2,
            background: '#f5f5f5',
          }}
        />

        <div style={{ flex: 1 }} />

        {dataLoaded && !isEditing && (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => setIsEditing(true)}
            style={{
              background: '#FF6B6B',
              borderColor: '#FF6B6B',
              borderRadius: 20,
              fontWeight: 600,
              paddingInline: 20,
            }}
          >
            进入编辑
          </Button>
        )}
        {isEditing && (
          <Button
            icon={<CloseOutlined />}
            onClick={async () => {
              setIsEditing(false);
              setBrushCodeId(null);
              // Run labor rule validation on exit edit
              runLaborValidation(true);
            }}
            style={{
              borderRadius: 20,
              fontWeight: 600,
              paddingInline: 20,
              borderColor: '#FF6B6B',
              color: '#FF6B6B',
            }}
          >
            退出编辑
          </Button>
        )}
        {violations && (violations.hardViolations.length > 0 || violations.softViolations.length > 0) && (
          <Button
            type="text"
            icon={<WarningOutlined />}
            onClick={() => setViolationModalOpen(true)}
            style={{
              color: violations.hardViolations.length > 0 ? '#ff4d4f' : '#faad14',
              fontWeight: 600,
            }}
          >
            {violations.hardViolations.length + violations.softViolations.length} 条违规
          </Button>
        )}

        <Button icon={<ReloadOutlined />} onClick={refreshMatrix} loading={loading} type="text" />
      </div>

      {error && (
        <Alert type="warning" showIcon message={error} style={{ marginBottom: 8 }} />
      )}

      {/* ===== Edit Mode Banner ===== */}
      {isEditing && (
        <div style={{
          background: brushCodeId
            ? 'linear-gradient(90deg, #1677ff 0%, #45B7D1 100%)'
            : 'linear-gradient(90deg, #FF6B6B 0%, #FF8C42 100%)',
          color: '#fff',
          padding: '8px 20px',
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 14,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'background 0.3s ease',
        }}>
          <span>
            {brushCodeId ? (
              <>
                <HighlightOutlined style={{ marginRight: 8 }} />
                刷子模式 — 点击任意单元格快速涂刷「{codeMap[brushCodeId]?.itemName || ''}」
                <Button
                  size="small" ghost
                  icon={<CloseOutlined />}
                  onClick={() => setBrushCodeId(null)}
                  style={{ marginLeft: 12, borderRadius: 12 }}
                >
                  取消刷子
                </Button>
              </>
            ) : (
              <>
                <EditOutlined style={{ marginRight: 8 }} />
                编辑模式 — 点击单元格修改 · 拖拽单元格交换班次
              </>
            )}
          </span>
          <Space>
            <Button size="small" ghost
              onClick={() => { setBatchMode('fill'); batchForm.resetFields(); batchForm.setFieldsValue({ dateRange: 'weekday', planned_hours: 8 }); setBatchModal(true); }}>
              批量填充
            </Button>
            <Button size="small" ghost danger
              onClick={() => { setBatchMode('clear'); batchForm.resetFields(); batchForm.setFieldsValue({ dateRange: 'all' }); setBatchModal(true); }}>
              批量清除
            </Button>
          </Space>
        </div>
      )}

      {/* ===== Week / Day Navigation Sub-Toolbar ===== */}
      {viewMode === 'week' && dataLoaded && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 16px', marginBottom: 12,
          background: 'linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%)',
          borderRadius: 10,
          border: '1px solid #e8ecf4',
        }}>
          <CalendarOutlined style={{ fontSize: 16, color: '#45B7D1' }} />
          <Typography.Text strong style={{ fontSize: 14, color: '#333' }}>周视图</Typography.Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Button
              type="text" size="small" icon={<LeftOutlined />}
              onClick={() => navigateWeek(-1)}
              style={{ borderRadius: 8 }}
            />
            <div style={{
              padding: '4px 16px',
              background: '#fff',
              borderRadius: 8,
              border: '1px solid #e8ecf4',
              fontWeight: 600,
              fontSize: 14,
              color: '#333',
              minWidth: 140,
              textAlign: 'center',
            }}>
              {weekLabel}
            </div>
            <Button
              type="text" size="small" icon={<RightOutlined />}
              onClick={() => navigateWeek(1)}
              style={{ borderRadius: 8 }}
            />
          </div>
          <Button
            size="small"
            onClick={() => {
              const today = dayjs();
              setWeekStart(today.startOf('week'));
              if (today.month() !== selectedMonth.month() || today.year() !== selectedMonth.year()) {
                setSelectedMonth(today.startOf('month'));
              }
            }}
            style={{ borderRadius: 16, fontSize: 12 }}
          >
            本周
          </Button>
          <div style={{ flex: 1 }} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {selectedMonth.format('YYYY年M月')} · 第{Math.ceil((weekStart.date() + weekStart.startOf('month').day()) / 7)}周
          </Typography.Text>
        </div>
      )}
      {viewMode === 'day' && dataLoaded && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 16px', marginBottom: 12,
          background: 'linear-gradient(135deg, #fff8f0 0%, #fff5f5 100%)',
          borderRadius: 10,
          border: '1px solid #f4e8e8',
        }}>
          <CalendarOutlined style={{ fontSize: 16, color: '#FF6B6B' }} />
          <Typography.Text strong style={{ fontSize: 14, color: '#333' }}>日视图</Typography.Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Button
              type="text" size="small" icon={<LeftOutlined />}
              onClick={() => navigateDay(-1)}
              style={{ borderRadius: 8 }}
            />
            <div style={{
              padding: '4px 16px',
              background: '#fff',
              borderRadius: 8,
              border: '1px solid #f4e8e8',
              fontWeight: 600,
              fontSize: 14,
              color: '#333',
              minWidth: 160,
              textAlign: 'center',
            }}>
              {selectedDay.format('YYYY年M月D日')}
              <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
                周{WEEKDAY_LABELS[selectedDay.day()]}
              </span>
            </div>
            <Button
              type="text" size="small" icon={<RightOutlined />}
              onClick={() => navigateDay(1)}
              style={{ borderRadius: 8 }}
            />
          </div>
          <Button
            size="small"
            onClick={() => {
              const today = dayjs();
              setSelectedDay(today);
              if (today.month() !== selectedMonth.month() || today.year() !== selectedMonth.year()) {
                setSelectedMonth(today.startOf('month'));
              }
            }}
            style={{ borderRadius: 16, fontSize: 12 }}
          >
            今天
          </Button>
          <div style={{ flex: 1 }} />
          <Tag color={selectedDay.day() === 0 || selectedDay.day() === 6 ? '#FF8C42' : '#45B7D1'}
            style={{ borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
            {selectedDay.day() === 0 || selectedDay.day() === 6 ? '周末' : '工作日'}
          </Tag>
        </div>
      )}

      {/* ===== Shift Code Tags + Stats ===== */}
      {dataLoaded && (
        <div style={{ marginBottom: 12 }}>
          {/* Code pills — clickable in edit mode to activate brush */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {isEditing && (
              <Tooltip title="点击编码启用刷子模式" placement="top">
                <Tag style={{
                  backgroundColor: '#f0f0f0',
                  color: '#666',
                  border: '1px dashed #d9d9d9',
                  borderRadius: 20,
                  padding: '2px 10px',
                  fontSize: 12,
                  lineHeight: '26px',
                  cursor: 'default',
                }}>
                  <HighlightOutlined style={{ marginRight: 4 }} />
                  刷子
                </Tag>
              </Tooltip>
            )}
            {codeItems.map(c => {
              const bg = codeColorMap[c.id];
              const isRest = isRestCategory(c);
              const isBrushActive = brushCodeId === c.id;
              const timeInfo = shiftTimeMap[c.id];
              const timeStr = timeInfo?.startTime && timeInfo?.endTime
                ? `${timeInfo.startTime}-${timeInfo.endTime}`
                : '';
              const hoursStr = timeInfo?.plannedHours ? `${timeInfo.plannedHours}h` : '';
              const tooltipText = [c.itemName, timeStr, hoursStr].filter(Boolean).join(' · ');
              return (
                <Tooltip key={c.id} title={tooltipText || c.itemName} mouseEnterDelay={0.3}>
                  <Tag
                    onClick={() => {
                      if (!isEditing) return;
                      setBrushCodeId(prev => prev === c.id ? null : c.id);
                    }}
                    style={{
                      backgroundColor: bg,
                      color: isRest ? REST_TEXT : getContrastColor(bg),
                      border: isBrushActive ? '2px solid #1677ff' : 'none',
                      borderRadius: 20,
                      padding: isBrushActive ? '0px 12px' : '2px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      lineHeight: '26px',
                      cursor: isEditing ? 'pointer' : 'default',
                      boxShadow: isBrushActive ? '0 0 0 3px rgba(22,119,255,0.25)' : undefined,
                      transition: 'all 0.2s ease',
                      transform: isBrushActive ? 'scale(1.1)' : undefined,
                    }}
                  >
                    {isBrushActive && <HighlightOutlined style={{ marginRight: 4, fontSize: 11 }} />}
                    {c.itemName || c.itemCode}
                    {timeStr && <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 4 }}>({timeStr})</span>}
                  </Tag>
                </Tooltip>
              );
            })}
          </div>
          {/* Usage stats */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
            {codeItems.filter(c => codeStats[c.id]).map(c => {
              const bg = codeColorMap[c.id];
              const isRest = isRestCategory(c);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tag style={{
                    backgroundColor: bg,
                    color: isRest ? REST_TEXT : getContrastColor(bg),
                    border: 'none',
                    borderRadius: 4,
                    padding: '0 6px',
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: '20px',
                  }}>
                    {c.itemName || c.itemCode}
                  </Tag>
                  <span style={{ fontSize: 13, color: '#666', fontWeight: 500 }}>
                    {codeStats[c.id]} 次
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Summary Cards ===== */}
      {stats && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{
            flex: 1, padding: '12px 20px',
            background: '#fff', borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            borderLeft: '4px solid #4ECDC4',
          }}>
            <div style={{ fontSize: 12, color: '#999' }}>团队总人数</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#333' }}>{stats.total}</div>
          </div>
          <div style={{
            flex: 1, padding: '12px 20px',
            background: '#fff', borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            borderLeft: '4px solid #45B7D1',
          }}>
            <div style={{ fontSize: 12, color: '#999' }}>已排班</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#45B7D1' }}>{stats.scheduled}</div>
          </div>
          <div style={{
            flex: 1, padding: '12px 20px',
            background: '#fff', borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            borderLeft: '4px solid #FF6B6B',
          }}>
            <div style={{ fontSize: 12, color: '#999' }}>未排班</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stats.unscheduled > 0 ? '#FF6B6B' : '#52c41a' }}>{stats.unscheduled}</div>
          </div>
          <div style={{
            flex: 1, padding: '12px 20px',
            background: '#fff', borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            borderLeft: '4px solid #FF8C42',
          }}>
            <div style={{ fontSize: 12, color: '#999' }}>当前项目</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#FF8C42', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedProjectName || '-'}
            </div>
          </div>
        </div>
      )}

      {/* ===== Department filter tabs ===== */}
      {dataLoaded && departments.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <Tag
            color={!selectedDept ? '#FF6B6B' : undefined}
            onClick={() => setSelectedDept(undefined)}
            style={{ cursor: 'pointer', borderRadius: 16, padding: '2px 12px', fontSize: 13 }}
          >
            全部部门
          </Tag>
          {departments.map(d => (
            <Tag
              key={d.id}
              color={selectedDept === d.id ? '#FF6B6B' : undefined}
              onClick={() => setSelectedDept(d.id)}
              style={{ cursor: 'pointer', borderRadius: 16, padding: '2px 12px', fontSize: 13 }}
            >
              {d.departmentName}
            </Tag>
          ))}
        </div>
      )}

      {/* ===== Matrix Table ===== */}
      {dataLoaded && matrixData.length > 0 ? (
        <div ref={tableWrapRef} style={{ flex: 1, minHeight: 0, minWidth: 0, width: '100%', position: 'relative' }}>
          <style>{`
            /* Force scrollbar always visible on macOS */
            .schedule-matrix-table .ant-table-body,
            .schedule-matrix-table .ant-table-content {
              overflow-x: auto !important;
              scrollbar-width: thin;
              scrollbar-color: rgba(0,0,0,0.35) #f0f0f0;
            }
            .schedule-matrix-table .ant-table-body::-webkit-scrollbar,
            .schedule-matrix-table .ant-table-content::-webkit-scrollbar {
              -webkit-appearance: none !important;
              height: 14px !important;
              display: block !important;
            }
            .schedule-matrix-table .ant-table-body::-webkit-scrollbar-track,
            .schedule-matrix-table .ant-table-content::-webkit-scrollbar-track {
              background: #f0f0f0 !important;
              border-radius: 7px !important;
            }
            .schedule-matrix-table .ant-table-body::-webkit-scrollbar-thumb,
            .schedule-matrix-table .ant-table-content::-webkit-scrollbar-thumb {
              background-color: rgba(0, 0, 0, 0.35) !important;
              border-radius: 7px !important;
              border: 3px solid #f0f0f0 !important;
              min-width: 50px !important;
            }
            .schedule-matrix-table .ant-table-body::-webkit-scrollbar-thumb:hover,
            .schedule-matrix-table .ant-table-content::-webkit-scrollbar-thumb:hover {
              background-color: rgba(0, 0, 0, 0.55) !important;
            }
          `}</style>

          {/* Left/Right scroll arrow buttons */}
          <Button
            type="primary" shape="circle" size="small"
            icon={<LeftOutlined />}
            onClick={() => scrollTable('left')}
            style={{
              position: 'absolute', left: 136, top: '50%', transform: 'translateY(-50%)',
              zIndex: 10, opacity: 0.7, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              background: '#fff', color: '#333', border: '1px solid #d9d9d9',
            }}
          />
          <Button
            type="primary" shape="circle" size="small"
            icon={<RightOutlined />}
            onClick={() => scrollTable('right')}
            style={{
              position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
              zIndex: 10, opacity: 0.7, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              background: '#fff', color: '#333', border: '1px solid #d9d9d9',
            }}
          />

          <Table
            className="schedule-matrix-table"
            dataSource={matrixData} columns={columns} size="small"
            scroll={{ x: scrollX, y: 'calc(100vh - 420px)' }}
            pagination={false} bordered={false} loading={loading}
            style={{ borderRadius: 12, overflow: 'hidden' }}
            rowClassName={(_, i) => i % 2 === 0 ? '' : 'schedule-alt-row'}
          />
        </div>
      ) : (
        <Card style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              !selectedProject ? '请先选择项目' :
              !selectedVersion ? '请选择排班版本，将自动加载数据' :
              loading ? '加载中...' :
              '暂无排班数据'
            }
          >
            {dataLoaded && !loading && (
              <Button type="primary" icon={<EditOutlined />}
                style={{ background: '#FF6B6B', borderColor: '#FF6B6B', borderRadius: 20 }}
                onClick={() => { setIsEditing(true); setBatchMode('fill'); batchForm.resetFields(); batchForm.setFieldsValue({ dateRange: 'weekday', planned_hours: 8 }); setBatchModal(true); }}>
                开始排班
              </Button>
            )}
          </Empty>
        </Card>
      )}

      {/* ===== Batch Modal ===== */}
      <Modal
        title={batchMode === 'fill' ? '批量填充排班' : '批量清除排班'}
        open={batchModal} onOk={executeBatch}
        onCancel={() => setBatchModal(false)}
        confirmLoading={saving} destroyOnClose width={500}
      >
        <Alert type={batchMode === 'fill' ? 'info' : 'warning'} showIcon
          message={batchMode === 'fill' ? '为目标员工在指定日期范围创建排班（已有排班不覆盖）' : '删除目标员工在指定日期范围的排班记录'}
          style={{ marginBottom: 16 }} />
        <Form form={batchForm} layout="vertical">
          <Form.Item name="employee_ids" label="目标员工（不选 = 全部当前员工）">
            <Select mode="multiple" placeholder="选择员工"
              options={filteredEmployees.map(e => ({ label: `${e.employeeNo || ''} ${e.fullName}`, value: e.id }))}
              showSearch optionFilterProp="label" maxTagCount={3} allowClear />
          </Form.Item>
          <Form.Item name="dateRange" label="日期范围" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="weekday">工作日</Radio>
              <Radio value="weekend">周末</Radio>
              <Radio value="all">全部</Radio>
              <Radio value="custom">自定义日期段</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.dateRange !== cur.dateRange}>
            {({ getFieldValue }) =>
              getFieldValue('dateRange') === 'custom' ? (
                <Form.Item name="customDateRange" label="选择日期段" rules={[{ required: true, message: '请选择日期范围' }]}>
                  <DatePicker.RangePicker
                    style={{ width: '100%' }}
                    getPopupContainer={trigger => trigger.parentNode as HTMLElement}
                    disabledDate={(current) => {
                      if (!current) return false;
                      return current.month() !== selectedMonth.month() || current.year() !== selectedMonth.year();
                    }}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          {batchMode === 'fill' && (
            <>
              <Form.Item name="schedule_code_dict_item_id" label="排班编码" rules={[{ required: true, message: '请选择' }]}>
                <Select placeholder="选择排班编码" showSearch optionFilterProp="label"
                  getPopupContainer={trigger => trigger.parentNode as HTMLElement}
                  options={codeItems.map(c => {
                    const ti = shiftTimeMap[c.id];
                    const timeStr = ti?.startTime && ti?.endTime ? ` (${ti.startTime}-${ti.endTime})` : '';
                    return { label: `${c.itemName}${timeStr}`, value: c.id };
                  })} />
              </Form.Item>
              <Form.Item name="planned_hours" label="工时（小时）">
                <InputNumber style={{ width: '100%' }} min={0} max={24} step={0.5} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* Labor Rule Violation Modal */}
      <Modal
        title={
          <span>
            <ExclamationCircleOutlined style={{ color: violations?.hardViolations?.length ? '#ff4d4f' : '#faad14', marginRight: 8 }} />
            用工规则校验结果
          </span>
        }
        open={violationModalOpen}
        onCancel={() => setViolationModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setViolationModalOpen(false)}>
            知道了
          </Button>,
        ]}
        width={600}
      >
        {violations && (
          <div>
            {violations.hardViolations.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Alert
                  type="error"
                  showIcon
                  message={`${violations.hardViolations.length} 条硬约束违规（应当修正）`}
                  style={{ marginBottom: 8 }}
                />
                {violations.hardViolations.map((v, i) => (
                  <div key={`hard-${i}`} style={{
                    padding: '8px 12px',
                    marginBottom: 4,
                    background: '#fff2f0',
                    borderRadius: 6,
                    borderLeft: '3px solid #ff4d4f',
                    fontSize: 13,
                  }}>
                    <div style={{ fontWeight: 500 }}>{v.message}</div>
                    <div style={{ color: '#999', fontSize: 12 }}>规则：{v.ruleName}</div>
                  </div>
                ))}
              </div>
            )}
            {violations.softViolations.length > 0 && (
              <div>
                <Alert
                  type="warning"
                  showIcon
                  message={`${violations.softViolations.length} 条软约束预警（建议关注）`}
                  style={{ marginBottom: 8 }}
                />
                {violations.softViolations.map((v, i) => (
                  <div key={`soft-${i}`} style={{
                    padding: '8px 12px',
                    marginBottom: 4,
                    background: '#fffbe6',
                    borderRadius: 6,
                    borderLeft: '3px solid #faad14',
                    fontSize: 13,
                  }}>
                    <div style={{ fontWeight: 500 }}>{v.message}</div>
                    <div style={{ color: '#999', fontSize: 12 }}>规则：{v.ruleName}</div>
                  </div>
                ))}
              </div>
            )}
            {violations.hardViolations.length === 0 && violations.softViolations.length === 0 && (
              <Alert type="success" showIcon message="所有排班均符合用工规则" />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
