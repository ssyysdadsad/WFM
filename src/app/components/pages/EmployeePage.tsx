import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, Space, Typography,
  message, Tag, Drawer, Descriptions, InputNumber, Switch, Row, Col,
  Upload, Alert, Progress, Divider, Tooltip, Popconfirm, Tabs,
} from 'antd';
import {
  PlusOutlined, EditOutlined, ReloadOutlined, EyeOutlined,
  DownloadOutlined, UploadOutlined, FileExcelOutlined, WarningOutlined,
  UserAddOutlined, LockOutlined, CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { supabase, supabaseUrl, publicAnonKey } from '@/app/lib/supabase/client';
import { useDict } from '@/app/hooks/useDict';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { addEmployeeSkill, listEmployeeSkills } from '@/app/services/employee-skill.service';
import {
  listChannelOptions,
  listDepartmentOptions,
  listEmployeeRecords,
  listSkillOptions,
  saveEmployeeRecord,
} from '@/app/services/master-data.service';
import {
  exportEmployeesToExcel,
  downloadEmployeeTemplate,
  parseEmployeeExcel,
  batchImportEmployees,
  type ImportRow,
} from '@/app/services/employee-excel.service';
import type {
  EmployeeFormValues,
  EmployeeRecord,
  EmployeeSkillFormValues,
  EmployeeSkillRecord,
  ReferenceOption,
} from '@/app/types/master-data';

type ImportResult = {
  successCount: number;
  failedRows: { rowIndex: number; name: string; reason: string }[];
};

export function EmployeePage() {
  const navigate = useNavigate();
  const [data, setData]               = useState<EmployeeRecord[]>([]);
  const [loading, setLoading]         = useState(false);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState<EmployeeRecord | null>(null);
  const [search, setSearch]           = useState('');
  const [filterDept, setFilterDept]   = useState<string | undefined>();
  const [filterLaborRelation, setFilterLaborRelation] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [form]                        = Form.useForm();
  const [departments, setDepartments] = useState<ReferenceOption[]>([]);
  const [channels, setChannels]       = useState<ReferenceOption[]>([]);
  const [detailOpen, setDetailOpen]   = useState(false);
  const [detailRecord, setDetailRecord] = useState<EmployeeRecord | null>(null);
  const [employeeSkills, setEmployeeSkills] = useState<EmployeeSkillRecord[]>([]);
  const [skillModal, setSkillModal]   = useState(false);
  const [skillForm]                   = Form.useForm();
  const [allSkills, setAllSkills]     = useState<ReferenceOption[]>([]);
  const { items: statusItems, loading: statusLoading } = useDict('employee_status');
  const { items: laborRelationItems, loading: laborRelationLoading } = useDict('labor_relation_type');
  // 暂存待编辑的记录，用于在 statusItems 异步加载完成后重新回填状态字段
  const [pendingEdit, setPendingEdit]   = useState<EmployeeRecord | null>(null);

  // Excel 导入相关状态
  const [importModalOpen, setImportModalOpen]   = useState(false);
  const [importRows, setImportRows]             = useState<ImportRow[]>([]);
  const [importLoading, setImportLoading]       = useState(false);
  const [importProgress, setImportProgress]     = useState(0);
  const [importResult, setImportResult]         = useState<ImportResult | null>(null);
  const [importFileName, setImportFileName]     = useState('');
  const fileInputRef                            = useRef<HTMLInputElement>(null);

  // 员工账号开通
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [provisionLoading, setProvisionLoading] = useState(false);

  // 超管密码管理
  const [isAdmin, setIsAdmin] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<EmployeeRecord | null>(null);
  const [pwdForm] = Form.useForm();
  const [pwdLoading, setPwdLoading] = useState(false);
  const [accountStatusMap, setAccountStatusMap] = useState<Record<string, { hasAccount: boolean; mustChange: boolean }>>({});

  // 排班历史
  const [scheduleHistory, setScheduleHistory] = useState<any[]>([]);
  const [scheduleHistoryLoading, setScheduleHistoryLoading] = useState(false);

  // 员工技能映射 { employeeId: skillName[] }
  const [allEmployeeSkillsMap, setAllEmployeeSkillsMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    loadData();
    loadRefs();
  }, []);

  // statusItems 异步加载完成后，若编辑弹窗已打开但状态字段尚未回填，补充设值
  useEffect(() => {
    if (pendingEdit && statusItems.length > 0) {
      form.setFieldValue('employee_status_dict_item_id', pendingEdit.employeeStatusDictItemId ?? undefined);
    }
  }, [statusItems, pendingEdit]);

  async function loadRefs() {
    try {
      const [departmentOptions, channelOptions, skillOptions] = await Promise.all([
        listDepartmentOptions(),
        listChannelOptions(),
        listSkillOptions(),
      ]);
      setDepartments(departmentOptions);
      setChannels(channelOptions);
      setAllSkills(skillOptions);
    } catch (error) {
      message.error(getErrorMessage(error, '加载员工关联数据失败'));
    }
  }

  /** 批量加载所有员工的技能映射 */
  async function loadAllEmployeeSkills() {
    try {
      const { data: esData } = await supabase
        .from('employee_skill')
        .select('employee_id, skill_id, skill:skill_id(name)')
        .eq('is_enabled', true);
      if (esData) {
        const map: Record<string, string[]> = {};
        esData.forEach((row: any) => {
          const empId = row.employee_id;
          const skillName = row.skill?.name || '';
          if (!map[empId]) map[empId] = [];
          if (skillName && !map[empId].includes(skillName)) map[empId].push(skillName);
        });
        setAllEmployeeSkillsMap(map);
      }
    } catch { /* ignore */ }
  }

  async function loadData(keyword = search) {
    setLoading(true);
    try {
      const rows = await listEmployeeRecords(keyword);
      setData(rows);
      // 加载技能映射
      loadAllEmployeeSkills();
    } catch (error) {
      message.error(getErrorMessage(error, '加载员工列表失败'));
    } finally {
      setLoading(false);
    }
  }

  /** 检查当前登录用户是否为超级管理员 — 使用现有 useCurrentUser hook */
  const { currentUser } = useCurrentUser();
  
  useEffect(() => {
    if (currentUser?.isAdmin || currentUser?.roleCodes?.includes('admin')) {
      setIsAdmin(true);
      loadAccountStatuses();
    }
  }, [currentUser]);

  /** 加载员工账号状态 */
  async function loadAccountStatuses() {
    try {
      const { data: accounts } = await supabase
        .from('user_account')
        .select('employee_id, must_change_password')
        .not('employee_id', 'is', null);
      if (accounts) {
        const map: Record<string, { hasAccount: boolean; mustChange: boolean }> = {};
        accounts.forEach(a => {
          if (a.employee_id) {
            map[a.employee_id] = { hasAccount: true, mustChange: a.must_change_password };
          }
        });
        setAccountStatusMap(map);
      }
    } catch (_) { /* ignore */ }
  }

  /** 重置员工密码（仅超管） */
  async function handleResetPassword() {
    if (!pwdTarget) return;
    try {
      const values = await pwdForm.validateFields();
      setPwdLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || publicAnonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/employee-account-provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          action: 'reset_password',
          employee_id: pwdTarget.id,
          new_password: values.new_password,
        }),
      });
      const result = await res.json();
      if (result.success) {
        message.success(result.message || '密码已重置');
        setPwdModalOpen(false);
        pwdForm.resetFields();
        loadAccountStatuses();
      } else {
        message.error(result.message || '重置失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(getErrorMessage(err, '重置密码失败'));
    } finally {
      setPwdLoading(false);
    }
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      const payload: EmployeeFormValues = {
        employeeNo: values.employee_no || `EMP-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`,
        fullName: values.full_name,
        mobileNumber: values.mobile_number,
        departmentId: values.department_id,
        channelId: values.channel_id,
        onboardDate: values.onboard_date ? dayjs(values.onboard_date).format('YYYY-MM-DD') : null,
        employeeStatusDictItemId: values.employee_status_dict_item_id ?? null,
        laborRelationDictItemId: values.labor_relation_dict_item_id ?? null,
        remark: values.remark ?? null,
      };
      const savedRecord = await saveEmployeeRecord(payload, editing?.id);
      const employeeId = editing?.id || savedRecord?.id;

      // 同步技能数据
      const selectedSkillIds: string[] = values.skill_ids || [];
      if (employeeId && selectedSkillIds.length > 0) {
        try {
          // 获取已有技能
          const existingSkills = await listEmployeeSkills(employeeId);
          const existingSkillIds = existingSkills.map(s => s.skillId);
          // 新增缺失的技能
          for (const skillId of selectedSkillIds) {
            if (!existingSkillIds.includes(skillId)) {
              await addEmployeeSkill(employeeId, {
                skillId,
                skillLevel: 1,
                efficiencyCoefficient: 1.0,
                isPrimary: false,
                isEnabled: true,
              });
            }
          }
          // 停用已移除的技能
          for (const es of existingSkills) {
            if (!selectedSkillIds.includes(es.skillId) && es.isEnabled) {
              await supabase.from('employee_skill').update({ is_enabled: false }).eq('id', es.id);
            }
          }
        } catch { /* 技能同步失败不阻塞保存 */ }
      }

      message.success(editing ? '更新成功' : '创建成功');
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      await loadData();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(getErrorMessage(error, '保存员工失败'));
    }
  }

  async function openDetail(record: EmployeeRecord) {
    setDetailRecord(record);
    setDetailOpen(true);
    try {
      const rows = await listEmployeeSkills(record.id);
      setEmployeeSkills(rows);
    } catch (error) {
      message.error(getErrorMessage(error, '加载员工技能失败'));
    }
    // 加载排班历史
    loadScheduleHistory(record.id);
  }

  async function loadScheduleHistory(employeeId: string) {
    setScheduleHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('schedule')
        .select('id, schedule_date, shift_code, work_hours, schedule_version_id')
        .eq('employee_id', employeeId)
        .order('schedule_date', { ascending: false })
        .limit(50);
      setScheduleHistory(data || []);
    } catch { /* ignore */ }
    finally { setScheduleHistoryLoading(false); }
  }

  async function addSkill() {
    try {
      if (!detailRecord) return;
      const values = await skillForm.validateFields();
      const payload: EmployeeSkillFormValues = {
        skillId: values.skill_id,
        skillLevel: values.skill_level,
        efficiencyCoefficient: values.efficiency_coefficient,
        isPrimary: values.is_primary,
        isEnabled: values.is_enabled,
      };
      await addEmployeeSkill(detailRecord.id, payload);
      message.success('技能添加成功');
      skillForm.resetFields();
      setSkillModal(false);
      const rows = await listEmployeeSkills(detailRecord.id);
      setEmployeeSkills(rows);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(getErrorMessage(error, '添加员工技能失败'));
    }
  }

  /** 导出当前列表到 Excel */
  async function handleExport() {
    if (!data.length) {
      message.warning('暂无员工数据可导出');
      return;
    }
    try {
      message.loading({ content: '正在导出...', key: 'export' });
      await exportEmployeesToExcel(data, deptMap, chMap, laborRelationMap, `员工列表_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
      message.success({ content: `已导出 ${data.length} 条员工记录`, key: 'export' });
    } catch (err) {
      message.error({ content: getErrorMessage(err, '导出失败'), key: 'export' });
    }
  }

  /** 文件选择后解析 Excel */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);
    setImportProgress(0);
    try {
      const rows = await parseEmployeeExcel(file);
      if (!rows.length) {
        message.warning('Excel 文件中未识别到有效数据行，请检查文件内容');
        return;
      }
      setImportRows(rows);
      setImportModalOpen(true);
    } catch (err) {
      message.error(getErrorMessage(err, '解析 Excel 失败，请确认文件格式正确'));
    }
    // 重置以允许再次选同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  /** 确认导入 */
  async function handleConfirmImport() {
    const validRows = importRows.filter((r) => !r.error);
    if (!validRows.length) {
      message.error('所有行都存在格式错误，请修正后重新上传');
      return;
    }
    setImportLoading(true);
    setImportProgress(0);

    try {
      // 模拟进度推进
      const timer = setInterval(() => {
        setImportProgress((p) => Math.min(p + 10, 90));
      }, 200);

      const result = await batchImportEmployees(importRows, departments, channels);
      clearInterval(timer);
      setImportProgress(100);
      setImportResult(result);

      if (result.successCount > 0) {
        message.success(`成功导入 ${result.successCount} 条员工记录`);
        await loadData();
      }
      if (result.failedRows.length > 0) {
        message.warning(`${result.failedRows.length} 行导入失败，请查看错误详情`);
      }
    } catch (err) {
      message.error(getErrorMessage(err, '导入过程中发生错误'));
    } finally {
      setImportLoading(false);
    }
  }

  /** 关闭导入弹窗并重置 */
  /** 为选中员工开通登录账号 */
  async function handleProvisionAccounts() {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选需要开通账号的员工');
      return;
    }
    setProvisionLoading(true);
    try {
      // Try real auth first; fall back to anon key for mock auth mode
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || publicAnonKey;
      const res = await fetch(`${supabaseUrl}/functions/v1/employee-account-provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({ employee_ids: selectedRowKeys, default_password: '123456789' }),
      });
      const result = await res.json();
      if (result.success) {
        message.success(result.message);
        // Show details
        if (result.data?.results) {
          const failed = result.data.results.filter((r: any) => r.status === 'failed');
          if (failed.length > 0) {
            Modal.warning({
              title: '部分员工开通失败',
              width: 500,
              content: (
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                  {failed.map((f: any, i: number) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <Tag color="red">{f.employeeName || f.employeeId}</Tag> {f.message}
                    </div>
                  ))}
                </div>
              ),
            });
          }
        }
        setSelectedRowKeys([]);
      } else {
        message.error(result.message || '开通失败');
      }
    } catch (err) {
      message.error(getErrorMessage(err, '开通账号失败'));
    } finally {
      setProvisionLoading(false);
    }
  }

  function closeImportModal() {
    setImportModalOpen(false);
    setImportRows([]);
    setImportResult(null);
    setImportProgress(0);
    setImportFileName('');
  }

  const deptMap   = useMemo(() => Object.fromEntries(departments.map((item) => [item.id, item.label])), [departments]);
  const chMap     = useMemo(() => Object.fromEntries(channels.map((item) => [item.id, item.label])), [channels]);
  const statusMap = useMemo(() => Object.fromEntries(statusItems.map((item) => [item.id, item.itemName])), [statusItems]);
  const laborRelationMap = useMemo(() => Object.fromEntries(laborRelationItems.map((item) => [item.id, item.itemName])), [laborRelationItems]);
  const skillMap  = useMemo(() => Object.fromEntries(allSkills.map((item) => [item.id, item.label])), [allSkills]);
  const levelMap: Record<number, string> = { 1: '初级', 2: '中级', 3: '高级' };

  // 前端多条件过滤
  const filteredData = useMemo(() => {
    return data.filter((emp) => {
      if (filterDept           && emp.departmentId              !== filterDept)           return false;
      if (filterLaborRelation  && emp.laborRelationDictItemId   !== filterLaborRelation)  return false;
      if (filterStatus         && emp.employeeStatusDictItemId  !== filterStatus)          return false;
      return true;
    });
  }, [data, filterDept, filterLaborRelation, filterStatus]);

  const hasFilter = !!(filterDept || filterLaborRelation || filterStatus);

  const errorCount = importRows.filter((r) => r.error).length;
  const validCount = importRows.filter((r) => !r.error).length;

  return (
    <div>
      {/* 顶部工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>员工管理</Typography.Title>
        <Space wrap>
          <Input.Search
            id="employee-search-input"
            placeholder="搜索姓名"
            allowClear
            style={{ width: 180 }}
            onSearch={(value) => { setSearch(value); loadData(value); }}
            onChange={(event) => { if (!event.target.value) { setSearch(''); loadData(''); } }}
          />
          <Button id="employee-refresh-btn" icon={<ReloadOutlined />} onClick={() => loadData()}>刷新</Button>

          {/* 导入按钮组 */}
          <Tooltip title="下载员工信息导入模板">
            <Button
              id="employee-download-template-btn"
              icon={<FileExcelOutlined />}
              onClick={downloadEmployeeTemplate}
            >
              下载模板
            </Button>
          </Tooltip>
          <Tooltip title="从 Excel 文件批量导入员工">
            <Button
              id="employee-import-btn"
              icon={<UploadOutlined />}
              onClick={() => fileInputRef.current?.click()}
            >
              导入
            </Button>
          </Tooltip>
          {/* 隐藏 file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <Tooltip title="将当前列表导出为 Excel 文件">
            <Button
              id="employee-export-btn"
              icon={<DownloadOutlined />}
              onClick={handleExport}
            >
              导出
            </Button>
          </Tooltip>

          <Tooltip title="为选中员工创建小程序登录账号（手机号+初始密码123456789）">
            <Button
              id="employee-provision-btn"
              icon={<UserAddOutlined />}
              loading={provisionLoading}
              disabled={selectedRowKeys.length === 0}
              onClick={handleProvisionAccounts}
            >
              开通账号{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
            </Button>
          </Tooltip>

          <Button
            id="employee-add-btn"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              form.resetFields();
              // 新增时默认设置状态为'在岗'
              const defaultStatus = statusItems.find(s => s.itemName === '在岗');
              if (defaultStatus) {
                form.setFieldValue('employee_status_dict_item_id', defaultStatus.id);
              }
              setModalOpen(true);
            }}
          >
            新增
          </Button>
        </Space>
      </div>

      {/* 筛选条件栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          allowClear
          placeholder="按部门筛选"
          style={{ width: 150 }}
          value={filterDept}
          onChange={(v) => setFilterDept(v)}
          options={departments.map((d) => ({ label: d.label, value: d.id }))}
        />
        <Select
          allowClear
          placeholder="按劳务关系筛选"
          style={{ width: 160 }}
          value={filterLaborRelation}
          onChange={(v) => setFilterLaborRelation(v)}
          options={laborRelationItems.map((item) => ({ label: item.itemName, value: item.id }))}
        />
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 130 }}
          value={filterStatus}
          onChange={(v) => setFilterStatus(v)}
          options={statusItems.map((s) => ({ label: s.itemName, value: s.id }))}
        />
        {hasFilter && (
          <Button
            size="small"
            onClick={() => { setFilterDept(undefined); setFilterLaborRelation(undefined); setFilterStatus(undefined); }}
          >
            清除筛选
          </Button>
        )}
        {hasFilter && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            已筛选 {filteredData.length} / {data.length} 条
          </Typography.Text>
        )}
      </div>

      {/* 员工列表表格 */}
      <Table
        rowKey="id"
        loading={loading}
        dataSource={filteredData}
        size="small"
        scroll={{ x: 'max-content' }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        columns={[
          { title: '工号', dataIndex: 'employeeNo', width: 80 },
          { title: '姓名', dataIndex: 'fullName', width: 80 },
          { title: '手机号', dataIndex: 'mobileNumber', width: 120 },
          { title: '部门', dataIndex: 'departmentId', width: 100, render: (value: string) => deptMap[value] || '-' },
          {
            title: '劳务关系', dataIndex: 'laborRelationDictItemId', width: 90,
            render: (value?: string | null) => {
              if (!value) return <span style={{ color: '#ccc' }}>-</span>;
              const label = laborRelationMap[value] || '-';
              const colorMap: Record<string, string> = { '正式员工': 'green', '劳务派遣': 'blue', '外包': 'orange', '兼职': 'cyan', '实习生': 'purple', '临时工': 'red' };
              return <Tag color={colorMap[label] || 'default'}>{label}</Tag>;
            },
          },
          {
            title: '技能', width: 140,
            render: (_: unknown, record: EmployeeRecord) => {
              const skills = allEmployeeSkillsMap[record.id] || [];
              if (!skills.length) return <span style={{ color: '#ccc' }}>-</span>;
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {skills.map((s, i) => <Tag key={i} color="blue" style={{ fontSize: 11, margin: 0 }}>{s}</Tag>)}
                </div>
              );
            },
          },
          { title: '入职日期', dataIndex: 'onboardDate', width: 100 },
          { title: '状态', dataIndex: 'employeeStatusDictItemId', width: 80, render: (value?: string | null) => <Tag>{value ? statusMap[value] || '-' : '-'}</Tag> },
          {
            title: '操作', key: 'action', width: isAdmin ? 220 : 160,
            render: (_: unknown, record: EmployeeRecord) => (
              <Space>
                <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
                <Button type="link" size="small" icon={<CalendarOutlined />} onClick={() => navigate(`/schedule/employee/${record.id}`)}>排班</Button>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={async () => {
                  setEditing(record);
                  setPendingEdit(record);
                  // 加载该员工已有技能以回填表单
                  let existingSkillIds: string[] = [];
                  try {
                    const skills = await listEmployeeSkills(record.id);
                    existingSkillIds = skills.filter(s => s.isEnabled).map(s => s.skillId);
                  } catch { /* ignore */ }
                  form.setFieldsValue({
                    employee_no: record.employeeNo,
                    full_name: record.fullName,
                    mobile_number: record.mobileNumber,
                    department_id: record.departmentId,
                    channel_id: record.channelId,
                    onboard_date: record.onboardDate ? dayjs(record.onboardDate) : undefined,
                    employee_status_dict_item_id: record.employeeStatusDictItemId ?? undefined,
                    labor_relation_dict_item_id: record.laborRelationDictItemId ?? undefined,
                    remark: record.remark,
                    skill_ids: existingSkillIds,
                  });
                  setModalOpen(true);
                }}>编辑</Button>
                {isAdmin && accountStatusMap[record.id]?.hasAccount && (
                  <Button type="link" size="small" icon={<LockOutlined />} onClick={() => {
                    setPwdTarget(record);
                    pwdForm.resetFields();
                    setPwdModalOpen(true);
                  }}>改密</Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      {/* 新增/编辑员工 Modal */}
      <Modal
        title={editing ? '编辑员工' : '新增员工'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); form.resetFields(); setPendingEdit(null); }}
        afterOpenChange={(open) => {
          // Modal 动画完成并真正显示后，如果 statusItems 已经就绪，再做一次回填以防万一
          if (open && pendingEdit && statusItems.length > 0) {
            form.setFieldValue('employee_status_dict_item_id', pendingEdit.employeeStatusDictItemId ?? undefined);
          }
        }}
        destroyOnClose
        width={800}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} scrollToFirstError={{ behavior: 'smooth', block: 'center' }}>
          <Row gutter={24}>
            {editing && (
              <Col span={12}>
                <Form.Item name="employee_no" label="工号" tooltip="系统自动生成">
                  <Input disabled style={{ color: '#333', backgroundColor: '#f5f5f5' }} />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item name="full_name" label="姓名" rules={[{ required: true, message: '必须输入姓名' }]}>
                <Input placeholder="输入员工规范姓名" maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="mobile_number" label="手机号" rules={[
                { required: true, message: '必须输入联系手机号' },
                { pattern: /^1\d{10}$/, message: '请输入由 1 开头的 11 位合法中国大陆手机号' }
              ]}>
                <Input placeholder="11位手机号码" maxLength={11} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="department_id" label="部门" rules={[{ required: true, message: '请归属其所在部门' }]}>
                <Select options={departments.map((item) => ({ label: item.label, value: item.id }))} placeholder="搜索或选择部门" showSearch optionFilterProp="label" virtual={true} listHeight={250} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="channel_id" label="渠道" rules={[{ required: true, message: '请设定其隶属渠道' }]}>
                <Select options={channels.map((item) => ({ label: item.label, value: item.id }))} placeholder="搜索或选择渠道" showSearch optionFilterProp="label" virtual={true} listHeight={250} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="onboard_date" label="入职日期">
                <DatePicker style={{ width: '100%' }} placeholder="年-月-日" format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="employee_status_dict_item_id" label="状态">
                <Select
                  loading={statusLoading}
                  options={statusItems.map((item) => ({ label: item.itemName, value: item.id }))}
                  placeholder="选择或搜索生命周期状态"
                  showSearch
                  optionFilterProp="label"
                  virtual={true}
                  listHeight={250}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="labor_relation_dict_item_id" label="劳务关系">
                <Select
                  loading={laborRelationLoading}
                  options={laborRelationItems.map((item) => ({ label: item.itemName, value: item.id }))}
                  placeholder="选择劳务关系类型"
                  showSearch
                  optionFilterProp="label"
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="skill_ids" label="技能" tooltip="可选择多个技能，保存后生效">
                <Select
                  mode="multiple"
                  placeholder="选择员工拥有的技能"
                  options={allSkills.map(s => ({ label: s.label, value: s.id }))}
                  showSearch
                  optionFilterProp="label"
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="补充背景或特征信息" maxLength={500} showCount />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 员工详情 Drawer */}
      <Drawer title={`员工详情 - ${detailRecord?.fullName || ''}`} open={detailOpen} onClose={() => setDetailOpen(false)} width={800}>
        {detailRecord && (
          <Tabs
            defaultActiveKey="basic"
            items={[
              {
                key: 'basic',
                label: '基本信息 & 技能',
                children: (
                  <>
                    <Descriptions bordered size="small" column={3}>
                      <Descriptions.Item label="工号">{detailRecord.employeeNo}</Descriptions.Item>
                      <Descriptions.Item label="姓名">{detailRecord.fullName}</Descriptions.Item>
                      <Descriptions.Item label="手机号">{detailRecord.mobileNumber}</Descriptions.Item>
                      <Descriptions.Item label="部门">{deptMap[detailRecord.departmentId] || '-'}</Descriptions.Item>
                      <Descriptions.Item label="渠道">{chMap[detailRecord.channelId] || '-'}</Descriptions.Item>
                      <Descriptions.Item label="劳务关系">
                        <Tag color={detailRecord.laborRelationDictItemId ? 'blue' : 'default'}>
                          {detailRecord.laborRelationDictItemId ? laborRelationMap[detailRecord.laborRelationDictItemId] || '-' : '-'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="入职日期">{detailRecord.onboardDate || '-'}</Descriptions.Item>
                      <Descriptions.Item label="状态">
                        <Tag color={detailRecord.employeeStatusDictItemId ? 'green' : 'default'}>
                          {detailRecord.employeeStatusDictItemId ? statusMap[detailRecord.employeeStatusDictItemId] || '-' : '-'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="备注" span={2}>{detailRecord.remark || '-'}</Descriptions.Item>
                    </Descriptions>
                    <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography.Title level={5}>技能列表</Typography.Title>
                      <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { skillForm.resetFields(); setSkillModal(true); }}>添加技能</Button>
                    </div>
                    <Table rowKey="id" size="small" dataSource={employeeSkills} pagination={false}
                      columns={[
                        { title: '技能', dataIndex: 'skillId', render: (value: string) => skillMap[value] || value?.substring(0, 8) },
                        { title: '级别', dataIndex: 'skillLevel', render: (value: number) => <Tag color={value === 3 ? 'gold' : value === 2 ? 'blue' : 'default'}>{levelMap[value] || value}</Tag> },
                        { title: '效率系数', dataIndex: 'efficiencyCoefficient' },
                        { title: '主技能', dataIndex: 'isPrimary', render: (value: boolean) => value ? <Tag color="green">是</Tag> : '否' },
                        { title: '状态', dataIndex: 'isEnabled', render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag> },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: 'schedule',
                label: <span><CalendarOutlined /> 排班历史</span>,
                children: (
                  <Table
                    rowKey="id"
                    size="small"
                    loading={scheduleHistoryLoading}
                    dataSource={scheduleHistory}
                    pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
                    columns={[
                      { title: '排班日期', dataIndex: 'schedule_date', width: 120 },
                      {
                        title: '班次', dataIndex: 'shift_code', width: 100,
                        render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <Tag>休息</Tag>,
                      },
                      {
                        title: '工时', dataIndex: 'work_hours', width: 80,
                        render: (v: number) => v ? `${v}h` : '-',
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </Drawer>

      {/* 添加技能 Modal */}
      <Modal title="添加技能" open={skillModal} onOk={addSkill} onCancel={() => setSkillModal(false)} destroyOnClose>
        <Form form={skillForm} layout="vertical" style={{ marginTop: 16 }} scrollToFirstError={{ behavior: 'smooth', block: 'center' }}>
          <Form.Item name="skill_id" label="技能" rules={[{ required: true, message: '请绑定有效技能' }]}>
            <Select options={allSkills.map((item) => ({ label: item.label, value: item.id }))} placeholder="搜索定位分配的技能" showSearch optionFilterProp="label" virtual={true} listHeight={250} />
          </Form.Item>
          <Form.Item name="skill_level" label="技能级别" rules={[{ required: true, message: '必选技能星级' }]}>
            <Select options={[{ label: '初级', value: 1 }, { label: '中级', value: 2 }, { label: '高级', value: 3 }]} placeholder="确认能力定级" />
          </Form.Item>
          <Form.Item name="efficiency_coefficient" label="效率系数" rules={[{ required: true }]} initialValue={1.0}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.1} placeholder="1.0为标准单位能效" />
          </Form.Item>
          <Form.Item name="is_primary" label="主技能" valuePropName="checked" initialValue={false}><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item>
          <Form.Item name="is_enabled" label="启用" valuePropName="checked" initialValue={true}><Switch checkedChildren="已启用" unCheckedChildren="已停用" /></Form.Item>
        </Form>
      </Modal>

      {/* Excel 导入确认 Modal */}
      <Modal
        title={
          <Space>
            <FileExcelOutlined style={{ color: '#52c41a' }} />
            <span>Excel 导入预览</span>
            {importFileName && <Typography.Text type="secondary" style={{ fontSize: 12 }}>（{importFileName}）</Typography.Text>}
          </Space>
        }
        open={importModalOpen}
        width={900}
        onCancel={closeImportModal}
        destroyOnClose
        footer={
          importResult
            ? [
                <Button key="close" onClick={closeImportModal}>关闭</Button>,
              ]
            : [
                <Button key="cancel" onClick={closeImportModal} disabled={importLoading}>取消</Button>,
                <Button
                  key="confirm"
                  type="primary"
                  icon={<UploadOutlined />}
                  loading={importLoading}
                  disabled={validCount === 0}
                  onClick={handleConfirmImport}
                >
                  确认导入 {validCount > 0 ? `(${validCount} 条)` : ''}
                </Button>,
              ]
        }
      >
        {/* 导入结果 */}
        {importResult ? (
          <div>
            <Alert
              type={importResult.failedRows.length > 0 ? 'warning' : 'success'}
              showIcon
              message={
                <span>
                  导入完成：成功 <strong>{importResult.successCount}</strong> 条，失败 <strong>{importResult.failedRows.length}</strong> 条
                </span>
              }
              style={{ marginBottom: 16 }}
            />
            {importResult.failedRows.length > 0 && (
              <Table
                size="small"
                rowKey="rowIndex"
                pagination={false}
                dataSource={importResult.failedRows}
                scroll={{ y: 300 }}
                columns={[
                  { title: 'Excel 行号', dataIndex: 'rowIndex', width: 80 },
                  { title: '姓名', dataIndex: 'name', width: 100 },
                  { title: '失败原因', dataIndex: 'reason', render: (v) => <Typography.Text type="danger">{v}</Typography.Text> },
                ]}
              />
            )}
          </div>
        ) : (
          <div>
            {/* 数据统计 */}
            <div style={{ marginBottom: 12, display: 'flex', gap: 16 }}>
              <Tag color="blue">共 {importRows.length} 行</Tag>
              <Tag color="green">有效 {validCount} 行</Tag>
              {errorCount > 0 && <Tag color="red" icon={<WarningOutlined />}>格式错误 {errorCount} 行（将被跳过）</Tag>}
            </div>

            {/* 进度条 */}
            {importLoading && (
              <Progress percent={importProgress} status="active" style={{ marginBottom: 12 }} />
            )}

            {/* 预览表格 */}
            <Table
              size="small"
              rowKey="rowIndex"
              pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 行` }}
              dataSource={importRows}
              scroll={{ x: 'max-content', y: 300 }}
              rowClassName={(record) => record.error ? 'ant-table-row-error' : ''}
              columns={[
                {
                  title: '行号', dataIndex: 'rowIndex', width: 60,
                  render: (v, record) => record.error
                    ? <Tooltip title={record.error}><Typography.Text type="danger">{v} ⚠</Typography.Text></Tooltip>
                    : v,
                },
                { title: '工号', dataIndex: 'employeeNo', width: 130, render: (v) => v || <Typography.Text type="secondary">（自动生成）</Typography.Text> },
                { title: '姓名', dataIndex: 'fullName', width: 100 },
                { title: '手机号', dataIndex: 'mobileNumber', width: 120 },
                { title: '部门', dataIndex: 'departmentName', width: 120 },
                { title: '渠道', dataIndex: 'channelName', width: 120 },
                { title: '入职日期', dataIndex: 'onboardDate', width: 110 },
                { title: '技能', dataIndex: 'skillNames', width: 140,
                  render: (v: string) => v
                    ? <span>{v.split(/[、，,;；]/).map((s, i) => <Tag key={i} color="cyan" style={{ margin: '1px' }}>{s.trim()}</Tag>)}</span>
                    : <Typography.Text type="secondary">—</Typography.Text>,
                },
                {
                  title: '状态', width: 70, render: (_, record) =>
                    record.error
                      ? <Tooltip title={record.error}><Tag color="red">错误</Tag></Tooltip>
                      : <Tag color="green">正常</Tag>,
                },
              ]}
            />

            <Divider style={{ margin: '12px 0' }} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              提示：部门名称和渠道名称需与系统中配置一致；工号为空时系统将自动生成；技能名称需与技能管理中一致，多个技能用顿号（、）分隔。
            </Typography.Text>
          </div>
        )}
      </Modal>
      {/* 错误行高亮 CSS */}
      <style>{`
        .ant-table-row-error td { background-color: #fff2f0 !important; }
      `}</style>

      {/* 密码重置 Modal（仅超管可见） */}
      {isAdmin && (
        <Modal
          title={<><LockOutlined style={{ marginRight: 8 }} />重置小程序登录密码 - {pwdTarget?.fullName}</>}
          open={pwdModalOpen}
          onOk={handleResetPassword}
          onCancel={() => { setPwdModalOpen(false); pwdForm.resetFields(); }}
          confirmLoading={pwdLoading}
          destroyOnClose
          width={480}
        >
          <Alert
            type="warning"
            showIcon
            message="重置后该员工下次登录小程序需使用新密码，且会被要求再次修改密码。"
            style={{ marginBottom: 16, marginTop: 8 }}
          />
          <Form form={pwdForm} layout="vertical">
            <Form.Item
              name="new_password"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 8, message: '密码至少8位' },
                { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: '密码需包含字母和数字' },
              ]}
            >
              <Input.Password placeholder="请输入新密码（至少8位，需含字母和数字）" />
            </Form.Item>
            <Form.Item
              name="confirm_password"
              label="确认密码"
              dependencies={['new_password']}
              rules={[
                { required: true, message: '请再次输入密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('new_password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="请再次输入密码" />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}
