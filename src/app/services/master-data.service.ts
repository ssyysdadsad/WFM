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
    laborRelationDictItemId: row.labor_relation_dict_item_id,
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
  const { data, error } = await supabase.from('project').select('id, project_name, project_code, start_date, end_date').order('project_name');

  if (error) {
    throw toAppError(error, '加载项目失败');
  }

  const rows = data ?? [];
  // Detect duplicate names to add date suffix for disambiguation
  const nameCount: Record<string, number> = {};
  rows.forEach((row) => { nameCount[row.project_name] = (nameCount[row.project_name] || 0) + 1; });

  return rows.map((row) => {
    let label = row.project_name;
    if (nameCount[row.project_name] > 1 && (row.start_date || row.end_date)) {
      const start = row.start_date?.substring(0, 7) || '?';
      const end = row.end_date?.substring(0, 7) || '?';
      label = `${row.project_name}（${start} ~ ${end}）`;
    }
    return { id: row.id, label, code: row.project_code };
  });
}

export async function listEmployeeRecords(keyword?: string) {
  let query = supabase.from('employee').select('*');
  query = applyTextSearch(query, 'full_name', keyword);

  const { data, error } = await query
    .order('department_id', { ascending: true })
    .order('full_name', { ascending: true })
    .limit(200);

  if (error) {
    throw toAppError(error, '加载员工列表失败');
  }

  return (data ?? []).map(mapEmployee);
}

export async function saveEmployeeRecord(payload: EmployeeFormValues, editingId?: string): Promise<EmployeeRecord | undefined> {
  const values = {
    employee_no: payload.employeeNo,
    full_name: payload.fullName,
    mobile_number: payload.mobileNumber,
    department_id: payload.departmentId,
    channel_id: payload.channelId,
    onboard_date: payload.onboardDate ?? null,
    employee_status_dict_item_id: payload.employeeStatusDictItemId ?? null,
    labor_relation_dict_item_id: payload.laborRelationDictItemId ?? null,
    remark: payload.remark ?? null,
  };

  if (editingId) {
    const { error } = await supabase.from('employee').update(values).eq('id', editingId);
    if (error) {
      throw toAppError(error, '保存员工失败');
    }
    return { ...payload, id: editingId } as any;
  }

  const { data, error } = await supabase.from('employee').insert(values).select().single();
  if (error) {
    throw toAppError(error, '保存员工失败');
  }
  return data ? mapEmployee(data) : undefined;
}

type ForeignColumnConfig = {
  key: string;
  foreignTable?: string;
  foreignLabel?: string;
  dictType?: string;
};

export async function loadCrudForeignOptions(columns: ForeignColumnConfig[]) {
  const foreignColumns = columns.filter((column) => column.foreignTable);
  const results: Record<string, any[]> = {};

  await Promise.all(
    foreignColumns.map(async (column) => {
      let query = supabase.from(column.foreignTable!);
      const labelField = column.foreignLabel || 'id';
      
      if (column.foreignTable === 'dict_item' && column.dictType) {
        query = query.select(`id, ${labelField}, dict_type!inner(type_code)`).eq('dict_type.type_code', column.dictType);
      } else if (column.foreignTable === 'project') {
        // Fetch dates for project disambiguation
        query = query.select(`id, ${labelField}, start_date, end_date`);
      } else {
        query = query.select(`id, ${labelField}`);
      }
      
      const { data, error } = await query.limit(500);

      if (error) {
        throw toAppError(error, `加载${column.foreignTable}关联选项失败`);
      }

      let rows = data || [];

      // Post-process: disambiguate same-name projects
      if (column.foreignTable === 'project' && rows.length > 0) {
        const nameCount: Record<string, number> = {};
        rows.forEach((r: any) => { const n = r[labelField]; nameCount[n] = (nameCount[n] || 0) + 1; });
        rows = rows.map((r: any) => {
          const name = r[labelField];
          if (nameCount[name] > 1 && (r.start_date || r.end_date)) {
            const s = r.start_date?.substring(0, 7) || '?';
            const e = r.end_date?.substring(0, 7) || '?';
            return { ...r, [labelField]: `${name}（${s} ~ ${e}）` };
          }
          return r;
        });
      }

      results[column.key] = rows;
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
  rangeFilters?: { field: string; op: 'gte' | 'lte' | 'gt' | 'lt'; value: string }[];
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
    rangeFilters,
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

  if (rangeFilters) {
    rangeFilters.forEach(({ field, op, value }) => {
      query = query[op](field, value);
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
