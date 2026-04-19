import React, { useState, useMemo } from 'react';
import {
  Select, DatePicker, Button, Space, Typography, Table, Tag, message,
  Modal, Form, Card, Tooltip, Dropdown, InputNumber,
  Empty, Alert, Input, Radio,
} from 'antd';
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, CopyOutlined,
  ClearOutlined, CalendarOutlined,
  TeamOutlined, FieldTimeOutlined,
  FormatPainterOutlined, CloseOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { useScheduleMatrix } from '@/app/hooks/useScheduleMatrix';
import {
  bulkUpsertScheduleCells,
  checkScheduleConflicts,
  deleteScheduleRecordsByIds,
  deleteSingleScheduleRecord,
  ensureConflictFree,
  resolveShiftTypeDictItemId,
} from '@/app/services/schedule.service';
import type { ScheduleCellChange, ScheduleCellRecord } from '@/app/types/schedule';

dayjs.locale('zh-cn');

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const CODE_COLORS: Record<string, string> = {
  morning: '#bae0ff', day: '#d6e4ff', evening: '#ffe7ba',
  night: '#efdbff', rest: '#d9f7be', leave: '#ffccc7',
  overtime: '#fff1b8', exception: '#ffd8bf',
};
const FALLBACK_BG = '#d6e4ff';
const WEEKEND_BG = '#f5f5f5';

function getCodeColor(codeItem: any) {
  if (!codeItem) return FALLBACK_BG;
  const extra = codeItem.extraConfig || {};
  if (extra.color) return extra.color;
  if (extra.category && CODE_COLORS[extra.category]) return CODE_COLORS[extra.category];
  return FALLBACK_BG;
}

export function ScheduleMatrixPage() {
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
    loading,
    dataLoaded,
    error,
    refreshMatrix,
    handleVersionChange,
  } = useScheduleMatrix();

  // ===== Paint Mode =====
  const [paintCode, setPaintCode] = useState<string | undefined>();
  const [paintHours, setPaintHours] = useState<number>(8);
  const [isPainting, setIsPainting] = useState(false);

  // ===== Edit Popover =====
  const [editCell, setEditCell] = useState<{ empId: string; day: number; } | null>(null);
  const [editCodeId, setEditCodeId] = useState<string | undefined>();
  const [editHours, setEditHours] = useState<number>(8);
  const [editRemark, setEditRemark] = useState('');
  const [saving, setSaving] = useState(false);

  // ===== Batch =====
  const [batchModal, setBatchModal] = useState(false);
  const [batchMode, setBatchMode] = useState<'fill' | 'clear'>('fill');
  const [batchForm] = Form.useForm();

  // ===== Computed =====
  const daysInMonth = selectedMonth.daysInMonth();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const todayStr = dayjs().format('YYYY-MM-DD');

  const codeMap = useMemo(() => {
    const m: Record<string, any> = {};
    codeItems.forEach(c => { m[c.id] = c; });
    return m;
  }, [codeItems]);

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
    if (selectedDept) emps = emps.filter(e => e.departmentId === selectedDept);
    // If data loaded but no schedules, show all (dept-filtered) employees so user can start assigning
    if (dataLoaded && involvedEmpIds.size === 0) return emps;
    // Otherwise show involved employees (plus dept filter)
    if (involvedEmpIds.size > 0) {
      emps = emps.filter(e => involvedEmpIds.has(e.id));
      if (selectedDept) emps = allEmployees.filter(e => e.departmentId === selectedDept && involvedEmpIds.has(e.id));
    }
    return emps;
  }, [allEmployees, selectedDept, dataLoaded, involvedEmpIds]);

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

  const stats = useMemo(() => {
    if (matrixData.length === 0) return null;
    const n = matrixData.length;
    const totalH = matrixData.reduce((s, r) => s + r._hours, 0);
    return { emps: n, records: schedules.length, hours: totalH, avg: (totalH / n).toFixed(1) };
  }, [matrixData, schedules]);

  // ===== Paint Mode: click cell to stamp =====
  async function handleCellClick(empId: string, day: number) {
    if (!selectedVersion || !selectedProject) return;

    const dateStr = selectedMonth.date(day).format('YYYY-MM-DD');
    const existing = scheduleMap.get(`${empId}_${dateStr}`);

    if (isPainting && paintCode) {
      setSaving(true);
      try {
        const emp = allEmployees.find(e => e.id === empId);
        const codeItem = codeMap[paintCode];
        const extra = codeItem?.extraConfig || {};
        const change: ScheduleCellChange = {
          employeeId: empId,
          departmentId: emp?.departmentId,
          projectId: selectedProject,
          scheduleDate: dateStr,
          scheduleCodeDictItemId: paintCode,
          shiftTypeDictItemId: resolveShiftTypeDictItemId(codeItem),
          plannedHours: paintHours ?? extra.standard_hours ?? 8,
          sourceType: 'manual',
        };

        ensureConflictFree(await checkScheduleConflicts({
          scheduleVersionId: selectedVersion,
          changes: [change],
        }));
        await bulkUpsertScheduleCells({
          scheduleVersionId: selectedVersion,
          changes: [change],
        });
        await refreshMatrix();
      } catch (error) {
        message.error(getErrorMessage(error, '保存排班失败'));
      } finally {
        setSaving(false);
      }
      return;
    }

    // Normal mode: open edit popover
    setEditCell({ empId, day });
    setEditCodeId(existing?.scheduleCodeDictItemId);
    setEditHours(existing?.plannedHours ?? 8);
    setEditRemark(existing?.remark || '');
  }

  async function saveEditCell() {
    if (!editCell || !editCodeId || !selectedVersion || !selectedProject) { message.warning('请选择排班编码'); return; }
    setSaving(true);
    try {
      const dateStr = selectedMonth.date(editCell.day).format('YYYY-MM-DD');
      const emp = allEmployees.find(e => e.id === editCell.empId);
      const codeItem = codeMap[editCodeId];
      const change: ScheduleCellChange = {
        employeeId: editCell.empId,
        departmentId: emp?.departmentId,
        projectId: selectedProject,
        scheduleDate: dateStr,
        scheduleCodeDictItemId: editCodeId,
        shiftTypeDictItemId: resolveShiftTypeDictItemId(codeItem),
        plannedHours: editHours,
        sourceType: 'manual',
        remark: editRemark || null,
      };
      ensureConflictFree(await checkScheduleConflicts({
        scheduleVersionId: selectedVersion,
        changes: [change],
      }));
      await bulkUpsertScheduleCells({
        scheduleVersionId: selectedVersion,
        changes: [change],
      });
      setEditCell(null);
      await refreshMatrix();
    } catch (error) {
      message.error(getErrorMessage(error, '保存排班失败'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEditCell() {
    if (!editCell) return;
    try {
      const dateStr = selectedMonth.date(editCell.day).format('YYYY-MM-DD');
      const existing = scheduleMap.get(`${editCell.empId}_${dateStr}`);
      if (!existing) { setEditCell(null); return; }
      await deleteSingleScheduleRecord(existing.id);
      setEditCell(null);
      await refreshMatrix();
    } catch (error) {
      message.error(getErrorMessage(error, '删除排班失败'));
    }
  }

  // ===== Row operations =====
  async function copyRow(empId: string) {
    if (!selectedVersion || !selectedProject) return;
    const empSchedules = schedules.filter(s => s.employeeId === empId);
    if (empSchedules.length === 0) { message.warning('暂无排班可复制'); return; }
    // Find last scheduled day, copy its code to all remaining empty days
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
      days.forEach(d => {
        const dt = selectedMonth.date(d);
        const dow = dt.day();
        if (values.dateRange === 'weekday' && (dow === 0 || dow === 6)) return;
        if (values.dateRange === 'weekend' && dow !== 0 && dow !== 6) return;
        dates.push(dt.format('YYYY-MM-DD'));
      });

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
                plannedHours: values.planned_hours ?? codeItem?.extraConfig?.standard_hours ?? 8,
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

  // ===== Build columns =====
  const columns = useMemo(() => {
    const cols: any[] = [
      { title: '工号', dataIndex: 'employee_no', width: 74, fixed: 'left' as const, ellipsis: true },
      { title: '姓名', dataIndex: 'full_name', width: 68, fixed: 'left' as const, ellipsis: true },
    ];
    if (!selectedDept) {
      cols.push({ title: '部门', dataIndex: 'department_name', width: 80, fixed: 'left' as const, ellipsis: true });
    }

    days.forEach(d => {
      const date = selectedMonth.date(d);
      const dow = date.day();
      const isWE = dow === 0 || dow === 6;
      const dateStr = date.format('YYYY-MM-DD');
      const isToday = dateStr === todayStr;

      cols.push({
        title: (
          <div style={{ textAlign: 'center', lineHeight: 1.15, userSelect: 'none' }}>
            <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? '#1677ff' : isWE ? '#f5222d' : undefined }}>{d}</div>
            <div style={{ fontSize: 10, color: isWE ? '#f5222d' : '#aaa' }}>{WEEKDAY_LABELS[dow]}</div>
          </div>
        ),
        dataIndex: `d${d}`,
        width: 62,
        onHeaderCell: () => ({
          style: { padding: '4px 1px', background: isToday ? '#e6f4ff' : isWE ? '#fafafa' : undefined },
        }),
        onCell: () => ({
          style: { padding: 0 },
        }),
        render: (schedule: any, record: any) => {
          const code = schedule ? codeMap[schedule.scheduleCodeDictItemId] : null;
          const label = code ? (code.itemName || code.itemCode || '') : '';
          const bg = schedule ? getCodeColor(code) : (isWE ? WEEKEND_BG : undefined);

          const cellContent = (
            <div
              onClick={() => handleCellClick(record.employee_id, d)}
              style={{
                cursor: isPainting ? 'crosshair' : 'pointer',
                height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: schedule ? 500 : 400,
                backgroundColor: bg,
                color: schedule ? '#333' : '#ccc',
                borderBottom: isToday ? '2px solid #1677ff' : undefined,
                transition: 'background 0.1s',
                position: 'relative' as const,
              }}
              onMouseEnter={e => { if (!schedule) (e.currentTarget.style.backgroundColor = '#f0f0f0'); }}
              onMouseLeave={e => { if (!schedule) (e.currentTarget.style.backgroundColor = bg || ''); }}
            >
              {label || (isPainting ? '' : '')}
            </div>
          );

          if (schedule && !isPainting) {
            return (
              <Tooltip
                title={<div style={{ fontSize: 12 }}>
                  <div><b>{code?.itemName || '?'}</b></div>
                  <div>工时 {schedule.plannedHours ?? 0}h</div>
                  {schedule.remark && <div>{schedule.remark}</div>}
                </div>}
                mouseEnterDelay={0.4}
              >
                {cellContent}
              </Tooltip>
            );
          }
          return cellContent;
        },
      });
    });

    // Summary columns
    cols.push(
      { title: <Tooltip title="出勤天数"><span style={{ fontSize: 12, fontWeight: 600 }}>勤</span></Tooltip>, dataIndex: '_work', width: 36, fixed: 'right' as const, render: (v: number) => <span style={{ fontWeight: 600, color: '#1677ff', fontSize: 12 }}>{v || ''}</span> },
      { title: <Tooltip title="休息天数"><span style={{ fontSize: 12, fontWeight: 600 }}>休</span></Tooltip>, dataIndex: '_rest', width: 36, fixed: 'right' as const, render: (v: number) => <span style={{ fontWeight: 600, color: '#52c41a', fontSize: 12 }}>{v || ''}</span> },
      { title: <Tooltip title="总工时"><span style={{ fontSize: 12, fontWeight: 600 }}>时</span></Tooltip>, dataIndex: '_hours', width: 40, fixed: 'right' as const, render: (v: number) => <span style={{ fontWeight: 600, color: '#fa8c16', fontSize: 12 }}>{v || ''}</span> },
      {
        title: '', key: 'op', width: 36, fixed: 'right' as const,
        render: (_: any, r: any) => (
          <Dropdown menu={{ items: [
            { key: 'copy', label: '延续排班', icon: <CopyOutlined />, onClick: () => copyRow(r.employee_id) },
            { key: 'clear', label: '清除整行', icon: <ClearOutlined />, danger: true, onClick: () => clearRow(r.employee_id) },
          ]}} trigger={['click']}>
            <Button type="text" size="small" icon={<MoreOutlined />} style={{ width: 28, height: 28 }} />
          </Dropdown>
        ),
      },
    );
    return cols;
  }, [days, selectedMonth, todayStr, codeMap, isPainting, paintCode, editCell, selectedDept]);

  // ===== Edit Popover Content =====
  const editPopoverContent = editCell ? (() => {
    const dateStr = selectedMonth.date(editCell.day).format('YYYY-MM-DD');
    const existing = scheduleMap.get(`${editCell.empId}_${dateStr}`);
    const emp = allEmployees.find(e => e.id === editCell.empId);
    return (
      <div style={{ width: 280 }}>
        <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
          {emp?.fullName} · {dateStr} ({WEEKDAY_LABELS[selectedMonth.date(editCell.day).day()]})
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>排班编码</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {codeItems.slice(0, 20).map(c => {
              const bg = getCodeColor(c);
              const isActive = editCodeId === c.id;
              return (
                <Tag
                  key={c.id}
                  onClick={() => {
                    setEditCodeId(c.id);
                    if (c.extraConfig?.standard_hours) setEditHours(c.extraConfig.standard_hours);
                  }}
                  style={{
                    cursor: 'pointer', margin: 0, fontSize: 11,
                    backgroundColor: bg, borderColor: isActive ? '#1677ff' : bg,
                    boxShadow: isActive ? '0 0 0 2px rgba(22,119,255,0.3)' : undefined,
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {c.itemName || c.itemCode}
                </Tag>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>工时</div>
            <InputNumber size="small" style={{ width: '100%' }} min={0} max={24} step={0.5}
              value={editHours} onChange={v => v !== null && setEditHours(v)} />
          </div>
          <div style={{ flex: 2 }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>备注</div>
            <Input size="small" placeholder="选填" value={editRemark} onChange={e => setEditRemark(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {existing ? (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={deleteEditCell}>删除</Button>
          ) : <span />}
          <Space size={4}>
            <Button size="small" onClick={() => setEditCell(null)}>取消</Button>
            <Button size="small" type="primary" loading={saving} onClick={saveEditCell}
              disabled={!editCodeId}>保存</Button>
          </Space>
        </div>
      </div>
    );
  })() : null;

  // ===== Render =====
  const fixedW = 74 + 68 + (selectedDept ? 0 : 80);
  const scrollX = fixedW + 62 * daysInMonth + 36 + 36 + 40 + 36 + 40;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <CalendarOutlined style={{ marginRight: 8 }} />排班矩阵
        </Typography.Title>
        {stats && (
          <Space size="middle" style={{ fontSize: 13, color: '#666' }}>
            <span><TeamOutlined /> <b>{stats.emps}</b> 人</span>
            <span><CalendarOutlined /> <b>{stats.records}</b> 条</span>
            <span><FieldTimeOutlined /> <b>{stats.hours.toFixed(0)}</b>h</span>
            <span>人均 <b>{stats.avg}</b>h</span>
          </Space>
        )}
      </div>
      {error && (
        <Alert
          type="warning"
          showIcon
          message={error}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Filter row */}
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '10px 14px' } }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <Select placeholder="选择项目" style={{ width: 180 }} value={selectedProject}
            onChange={setSelectedProject} showSearch optionFilterProp="label"
            options={projects.map(p => ({ label: p.projectName, value: p.id }))} />
          <DatePicker picker="month" value={selectedMonth}
            onChange={v => v && setSelectedMonth(v)} style={{ width: 120 }} />
          <Select placeholder={selectedProject ? '选择版本' : '先选项目'}
            style={{ width: 170 }} value={selectedVersion}
            onChange={handleVersionChange}
            options={versions.map(v => ({
              label: `v${v.versionNo} · ${v.generationType === 'manual' ? '手工' : v.generationType === 'template' ? '模板' : v.generationType}`,
              value: v.id,
            }))}
            disabled={!selectedProject} />
          <Select placeholder="全部部门" style={{ width: 130 }} value={selectedDept}
            onChange={setSelectedDept} allowClear showSearch optionFilterProp="label"
            options={departments.map(d => ({ label: d.departmentName, value: d.id }))} />
          <Button icon={<ReloadOutlined />} onClick={refreshMatrix} loading={loading}>刷新</Button>

          <div style={{ flex: 1 }} />

          {/* Batch buttons */}
          {dataLoaded && (
            <Space size={4}>
              <Button size="small" icon={<EditOutlined />}
                onClick={() => { setBatchMode('fill'); batchForm.resetFields(); batchForm.setFieldsValue({ dateRange: 'weekday', planned_hours: 8 }); setBatchModal(true); }}>
                批量填充
              </Button>
              <Button size="small" danger icon={<ClearOutlined />}
                onClick={() => { setBatchMode('clear'); batchForm.resetFields(); batchForm.setFieldsValue({ dateRange: 'all' }); setBatchModal(true); }}>
                批量清除
              </Button>
            </Space>
          )}
        </div>
      </Card>

      {/* Paint Mode Bar */}
      {dataLoaded && (
        <Card size="small" style={{
          marginBottom: 12,
          border: isPainting ? '2px solid #1677ff' : '1px solid #f0f0f0',
          background: isPainting ? '#f0f5ff' : '#fff',
          transition: 'all 0.2s',
        }} styles={{ body: { padding: '8px 14px' } }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Button
              type={isPainting ? 'primary' : 'default'}
              icon={<FormatPainterOutlined />}
              onClick={() => setIsPainting(!isPainting)}
              size="small"
            >
              {isPainting ? '刷班中（点单元格直接排班）' : '刷班模式'}
            </Button>

            {isPainting && (
              <Button size="small" icon={<CloseOutlined />} danger type="text"
                onClick={() => { setIsPainting(false); setPaintCode(undefined); }}>
                退出
              </Button>
            )}

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {codeItems.slice(0, 18).map(c => {
                const bg = getCodeColor(c);
                const isActive = paintCode === c.id;
                return (
                  <Tag
                    key={c.id}
                    onClick={() => {
                      setPaintCode(c.id);
                      if (c.extraConfig?.standard_hours) setPaintHours(c.extraConfig.standard_hours);
                      if (!isPainting) setIsPainting(true);
                    }}
                    style={{
                      cursor: 'pointer', margin: 0, fontSize: 11, lineHeight: '22px',
                      backgroundColor: bg,
                      borderColor: isActive ? '#1677ff' : 'transparent',
                      boxShadow: isActive ? '0 0 0 2px rgba(22,119,255,0.25)' : undefined,
                      fontWeight: isActive ? 700 : 400,
                      transition: 'all 0.15s',
                    }}
                  >
                    {c.itemName || c.itemCode}
                  </Tag>
                );
              })}
            </div>

            {isPainting && (
              <Space size={4}>
                <span style={{ fontSize: 12, color: '#666' }}>工时:</span>
                <InputNumber size="small" style={{ width: 60 }} min={0} max={24} step={0.5}
                  value={paintHours} onChange={v => v !== null && setPaintHours(v)} />
              </Space>
            )}
          </div>
        </Card>
      )}

      {/* Matrix */}
      {dataLoaded && matrixData.length > 0 ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <Table
            dataSource={matrixData} columns={columns} size="small"
            scroll={{ x: scrollX, y: 'calc(100vh - 380px)' }}
            pagination={false} bordered loading={loading}
            rowClassName={(_, i) => i % 2 === 0 ? '' : 'schedule-alt-row'}
          />
        </div>
      ) : (
        <Card style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              <Space>
                <Button type="primary" icon={<EditOutlined />}
                  onClick={() => { setBatchMode('fill'); batchForm.resetFields(); batchForm.setFieldsValue({ dateRange: 'weekday', planned_hours: 8 }); setBatchModal(true); }}>
                  批量填充排班
                </Button>
              </Space>
            )}
          </Empty>
        </Card>
      )}

      {/* Edit Popover as Modal-style overlay */}
      <Modal
        open={!!editCell && !isPainting}
        onCancel={() => setEditCell(null)}
        footer={null}
        width={340}
        title={null}
        closable={false}
        styles={{ body: { padding: '16px' } }}
        destroyOnClose
      >
        {editPopoverContent}
      </Modal>

      {/* Batch Modal */}
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
            </Radio.Group>
          </Form.Item>
          {batchMode === 'fill' && (
            <>
              <Form.Item name="schedule_code_dict_item_id" label="排班编码" rules={[{ required: true, message: '请选择' }]}>
                <Select placeholder="选择排班编码" showSearch optionFilterProp="label"
                  options={codeItems.map(c => ({ label: `${c.itemName} (${c.itemCode || ''})`, value: c.id }))} />
              </Form.Item>
              <Form.Item name="planned_hours" label="工时（小时）">
                <InputNumber style={{ width: '100%' }} min={0} max={24} step={0.5} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
