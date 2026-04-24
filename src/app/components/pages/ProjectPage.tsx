import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DatePicker, Drawer, Table, Button, Space, Tag, message, Select,
  Typography, Popconfirm, Descriptions, Divider, Badge, Input,
} from 'antd';
import {
  TeamOutlined, PlusOutlined, DeleteOutlined, SearchOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { CrudPage } from '../CrudPage';
import { listCrudRows, loadCrudForeignOptions, saveCrudRow } from '@/app/services/master-data.service';
import { supabase } from '../supabase';
import { getErrorMessage } from '@/app/lib/supabase/errors';

interface ProjectMember {
  id: string;
  employeeId: string;
  fullName: string;
  employeeNo: string;
  departmentName: string;
  role: string;
  isActive: boolean;
  joinedAt: string;
}

export function ProjectPage() {
  const [filterMonth, setFilterMonth] = useState<dayjs.Dayjs | null>(null);

  // 成员管理状态
  const [memberDrawerOpen, setMemberDrawerOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<any>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [allEmployees, setAllEmployees] = useState<{ id: string; fullName: string; employeeNo: string; departmentName: string }[]>([]);
  const [addingEmpIds, setAddingEmpIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  const rangeFilters = useMemo(() => {
    if (!filterMonth) return undefined;
    const monthStart = filterMonth.startOf('month').format('YYYY-MM-DD');
    const monthEnd = filterMonth.endOf('month').format('YYYY-MM-DD');
    return [
      { field: 'start_date', op: 'lte' as const, value: monthEnd },
      { field: 'end_date', op: 'gte' as const, value: monthStart },
    ];
  }, [filterMonth]);

  // 加载所有员工（用于添加成员选择）
  const loadAllEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employee')
      .select('id, full_name, employee_no, department:department_id(department_name)')
      .order('full_name');
    setAllEmployees(
      (data || []).map((e: any) => ({
        id: e.id,
        fullName: e.full_name,
        employeeNo: e.employee_no || '',
        departmentName: e.department?.department_name || '-',
      }))
    );
  }, []);

  // 加载项目成员
  const loadMembers = useCallback(async (projectId: string) => {
    setMembersLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_employee')
        .select('id, employee_id, role, is_active, joined_at, employee:employee_id(full_name, employee_no, department:department_id(department_name))')
        .eq('project_id', projectId)
        .order('created_at');

      if (error) throw error;

      setMembers(
        (data || []).map((row: any) => ({
          id: row.id,
          employeeId: row.employee_id,
          fullName: row.employee?.full_name || '-',
          employeeNo: row.employee?.employee_no || '-',
          departmentName: row.employee?.department?.department_name || '-',
          role: row.role || 'member',
          isActive: row.is_active,
          joinedAt: row.joined_at,
        }))
      );
    } catch (e) {
      message.error(getErrorMessage(e, '加载项目成员失败'));
    } finally {
      setMembersLoading(false);
    }
  }, []);

  // 打开成员管理
  const openMemberDrawer = useCallback(async (record: any) => {
    setCurrentProject(record);
    setMemberDrawerOpen(true);
    setAddingEmpIds([]);
    setMemberSearch('');
    await loadMembers(record.id);
    await loadAllEmployees();
  }, [loadMembers, loadAllEmployees]);

  // 添加成员
  const handleAddMembers = useCallback(async () => {
    if (!currentProject || addingEmpIds.length === 0) return;
    try {
      const rows = addingEmpIds.map(empId => ({
        project_id: currentProject.id,
        employee_id: empId,
        role: 'member',
      }));
      const { error } = await supabase.from('project_employee').upsert(rows, { onConflict: 'project_id,employee_id' });
      if (error) throw error;
      message.success(`已添加 ${addingEmpIds.length} 名成员`);
      setAddingEmpIds([]);
      await loadMembers(currentProject.id);
    } catch (e) {
      message.error(getErrorMessage(e, '添加成员失败'));
    }
  }, [currentProject, addingEmpIds, loadMembers]);

  // 移除成员
  const handleRemoveMember = useCallback(async (peId: string) => {
    try {
      const { error } = await supabase.from('project_employee').delete().eq('id', peId);
      if (error) throw error;
      message.success('已移除');
      if (currentProject) await loadMembers(currentProject.id);
    } catch (e) {
      message.error(getErrorMessage(e, '移除成员失败'));
    }
  }, [currentProject, loadMembers]);

  // 当前已在项目中的员工 ID 集合
  const existingMemberIds = useMemo(() => new Set(members.map(m => m.employeeId)), [members]);

  // 可添加的员工（排除已有成员）
  const availableEmployees = useMemo(() => {
    return allEmployees.filter(e => !existingMemberIds.has(e.id));
  }, [allEmployees, existingMemberIds]);

  // 搜索过滤
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const keyword = memberSearch.trim().toLowerCase();
    return members.filter(m =>
      m.fullName.toLowerCase().includes(keyword) ||
      m.employeeNo.toLowerCase().includes(keyword) ||
      m.departmentName.toLowerCase().includes(keyword)
    );
  }, [members, memberSearch]);

  return (
    <>
      <CrudPage
        title="项目管理"
        tableName="project"
        searchField="project_name"
        renderExtraFilters={() => (
          <DatePicker
            picker="month"
            allowClear
            placeholder="按月份筛选"
            style={{ width: 150 }}
            value={filterMonth}
            onChange={(v) => setFilterMonth(v)}
          />
        )}
        service={{
          list: (options) =>
            listCrudRows({
              tableName: 'project',
              searchField: options.searchField,
              search: options.search,
              defaultSort: options.defaultSort,
              extraFilters: options.extraFilters,
              rangeFilters,
              selectQuery: options.selectQuery,
              page: options.page,
              pageSize: options.pageSize,
            }),
          save: (values, editingId) => saveCrudRow('project', values, editingId),
          delete: async (id: string) => {
            const { error } = await supabase.rpc('cascade_delete_project', { p_project_id: id });
            if (error) throw error;
          },
          loadForeignData: loadCrudForeignOptions,
        }}
        columns={[
          { key: 'project_code', title: '项目编码', autoCode: 'PRJ', hideInTable: true },
          { key: 'project_name', title: '项目名称', required: true },
          { key: 'scene_id', title: '关联场景', required: true, foreignTable: 'scene', foreignLabel: 'scene_name' },
          { key: 'project_mode', title: '项目模式', type: 'select', required: true, options: [
            { label: '自建场景', value: 'self_built' },
            { label: '非侵入式', value: 'non_intrusive' },
          ]},
          { key: 'start_date', title: '开始日期', type: 'date', required: true },
          { key: 'end_date', title: '结束日期', type: 'date', required: true },
          { key: 'owner_employee_id', title: '负责人', foreignTable: 'employee', foreignLabel: 'full_name' },
          { key: 'project_status_dict_item_id', title: '状态', foreignTable: 'dict_item', foreignLabel: 'item_name', dictType: 'project_status', filterable: true },
          { key: 'remark', title: '备注', type: 'textarea', hideInTable: true },
          {
            key: '_members',
            title: '成员',
            hideInForm: true,
            render: (_: any, record: any) => (
              <Button
                type="link"
                size="small"
                icon={<TeamOutlined />}
                onClick={() => openMemberDrawer(record)}
              >
                管理成员
              </Button>
            ),
          },
        ]}
      />

      {/* 成员管理抽屉 */}
      <Drawer
        title={
          <Space>
            <TeamOutlined />
            <span>项目成员管理 — {currentProject?.project_name || ''}</span>
            <Badge count={members.length} style={{ backgroundColor: '#1677ff' }} />
          </Space>
        }
        open={memberDrawerOpen}
        onClose={() => setMemberDrawerOpen(false)}
        width={720}
      >
        {/* 添加成员区域 */}
        <div style={{ marginBottom: 16, padding: 16, background: '#f5f7fa', borderRadius: 8 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            <PlusOutlined /> 添加成员
          </Typography.Text>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              mode="multiple"
              placeholder="搜索并选择员工..."
              value={addingEmpIds}
              onChange={setAddingEmpIds}
              style={{ flex: 1 }}
              showSearch
              optionFilterProp="label"
              maxTagCount={3}
              virtual
              listHeight={250}
              options={availableEmployees.map(e => ({
                label: `${e.fullName} (${e.employeeNo}) - ${e.departmentName}`,
                value: e.id,
              }))}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={addingEmpIds.length === 0}
              onClick={handleAddMembers}
            >
              添加 {addingEmpIds.length > 0 ? `(${addingEmpIds.length})` : ''}
            </Button>
          </Space.Compact>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 搜索 */}
        <Input.Search
          placeholder="搜索成员..."
          allowClear
          style={{ marginBottom: 12 }}
          onSearch={setMemberSearch}
          onChange={e => { if (!e.target.value) setMemberSearch(''); }}
          prefix={<SearchOutlined />}
        />

        {/* 成员列表 */}
        <Table
          rowKey="id"
          size="small"
          loading={membersLoading}
          dataSource={filteredMembers}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 名成员`, size: 'small' }}
          columns={[
            {
              title: '姓名',
              dataIndex: 'fullName',
              width: 120,
              render: (v: string) => (
                <Space>
                  <UserOutlined style={{ color: '#1677ff' }} />
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </Space>
              ),
            },
            { title: '工号', dataIndex: 'employeeNo', width: 120 },
            { title: '部门', dataIndex: 'departmentName', width: 140 },
            {
              title: '角色',
              dataIndex: 'role',
              width: 90,
              render: (v: string) => (
                <Tag color={v === 'leader' ? 'gold' : 'blue'}>
                  {v === 'leader' ? '组长' : '成员'}
                </Tag>
              ),
            },
            {
              title: '加入时间',
              dataIndex: 'joinedAt',
              width: 120,
              render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
            },
            {
              title: '操作',
              key: 'action',
              width: 80,
              render: (_: any, record: ProjectMember) => (
                <Popconfirm
                  title="确认移除该成员？"
                  okText="移除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => handleRemoveMember(record.id)}
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                    移除
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Drawer>
    </>
  );
}
