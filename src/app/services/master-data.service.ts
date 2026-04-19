import { supabase } from '@/app/lib/supabase/client';
import { applyTextSearch } from '@/app/lib/supabase/query';
import { toAppError } from '@/app/lib/supabase/errors';
import type { EmployeeFormValues, EmployeeRecord, ReferenceOption } from '@/app/types/master-data';

function mapReferenceOption(row: any, labelKey: string, codeKey?: string): ReferenceOption {
  return {
    id: row.id,
    label: row[labelKey],
    code: codeKey ? row[codeKey] : undefined,
  };
}

function mapEmployee(row: any): EmployeeRecord {
  return {
    id: row.id,
    employeeNo: row.employee_no,
    fullName: row.full_name,
    mobileNumber: row.mobile_number,
    departmentId: row.department_id,
    channelId: row.channel_id,
    onboardDate: row.onboard_date,
    employeeStatusDictItemId: row.employee_status_dict_item_id,
    remark: row.remark,
  };
}

export async function listDepartmentOptions() {
  const { data, error } = await supabase.from('department').select('id, department_name, department_code').order('department_name');

  if (error) {
    throw toAppError(error, '加载部门失败');
  }

  return (data ?? []).map((row) => mapReferenceOption(row, 'department_name', 'department_code'));
}

export async function listChannelOptions() {
  const { data, error } = await supabase.from('channel').select('id, channel_name, channel_code').order('channel_name');

  if (error) {
    throw toAppError(error, '加载渠道失败');
  }

  return (data ?? []).map((row) => mapReferenceOption(row, 'channel_name', 'channel_code'));
}

export async function listSkillOptions() {
  const { data, error } = await supabase.from('skill').select('id, skill_name, skill_code').order('skill_name');

  if (error) {
    throw toAppError(error, '加载技能失败');
  }

  return (data ?? []).map((row) => mapReferenceOption(row, 'skill_name', 'skill_code'));
}

export async function listProjectOptions() {
  const { data, error } = await supabase.from('project').select('id, project_name, project_code').order('project_name');

  if (error) {
    throw toAppError(error, '加载项目失败');
  }

  return (data ?? []).map((row) => mapReferenceOption(row, 'project_name', 'project_code'));
}

export async function listEmployeeRecords(keyword?: string) {
  let query = supabase.from('employee').select('*');
  query = applyTextSearch(query, 'full_name', keyword);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100);

  if (error) {
    throw toAppError(error, '加载员工列表失败');
  }

  return (data ?? []).map(mapEmployee);
}

export async function saveEmployeeRecord(payload: EmployeeFormValues, editingId?: string) {
  const values = {
    employee_no: payload.employeeNo,
    full_name: payload.fullName,
    mobile_number: payload.mobileNumber,
    department_id: payload.departmentId,
    channel_id: payload.channelId,
    onboard_date: payload.onboardDate ?? null,
    employee_status_dict_item_id: payload.employeeStatusDictItemId ?? null,
    remark: payload.remark ?? null,
  };

  if (editingId) {
    const { error } = await supabase.from('employee').update(values).eq('id', editingId);
    if (error) {
      throw toAppError(error, '保存员工失败');
    }
    return;
  }

  const { error } = await supabase.from('employee').insert(values);
  if (error) {
    throw toAppError(error, '保存员工失败');
  }
}

type ForeignColumnConfig = {
  key: string;
  foreignTable?: string;
  foreignLabel?: string;
};

export async function loadCrudForeignOptions(columns: ForeignColumnConfig[]) {
  const foreignColumns = columns.filter((column) => column.foreignTable);
  const results: Record<string, any[]> = {};

  await Promise.all(
    foreignColumns.map(async (column) => {
      const { data, error } = await supabase
        .from(column.foreignTable!)
        .select(`id, ${column.foreignLabel || 'id'}`)
        .limit(500);

      if (error) {
        throw toAppError(error, `加载${column.foreignTable}关联选项失败`);
      }

      results[column.key] = data || [];
    }),
  );

  return results;
}

export async function listCrudRows(options: {
  tableName: string;
  searchField?: string;
  search?: string;
  defaultSort?: string;
  extraFilters?: Record<string, any>;
  selectQuery?: string;
  page?: number;
  pageSize?: number;
}) {
  const {
    tableName,
    searchField,
    search,
    defaultSort = 'created_at',
    extraFilters,
    selectQuery = '*',
    page = 1,
    pageSize = 20,
  } = options;

  let query = supabase.from(tableName).select(selectQuery, { count: 'exact' });

  if (extraFilters) {
    Object.entries(extraFilters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
  }

  query = applyTextSearch(query, searchField, search);

  const { data, count, error } = await query
    .order(defaultSort, { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    throw toAppError(error, `加载${tableName}数据失败`);
  }

  return {
    data: data || [],
    total: count || 0,
  };
}

export async function saveCrudRow(tableName: string, values: Record<string, any>, editingId?: string) {
  if (editingId) {
    const { error } = await supabase.from(tableName).update(values).eq('id', editingId);
    if (error) {
      throw toAppError(error, `保存${tableName}数据失败`);
    }
    return;
  }

  const { error } = await supabase.from(tableName).insert(values);
  if (error) {
    throw toAppError(error, `保存${tableName}数据失败`);
  }
}
