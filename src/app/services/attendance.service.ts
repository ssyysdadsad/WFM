import { supabase } from '@/app/lib/supabase/client';

export interface AttendanceImportBatch {
  id: string;
  projectId: string;
  month: string;
  fileName: string;
  createdAt: string;
  createdBy?: string;
}

export interface AttendanceRecord {
  id: string;
  batchId: string;
  employeeId: string;
  projectId: string;
  recordDate: string; // YYYY-MM-DD
  firstPunchTime: string | null;
  lastPunchTime: string | null;
  rawData: string;
  calculatedStatus: string | null;
  createdAt: string;
}

export async function createAttendanceBatch(
  projectId: string,
  month: string,
  fileName: string
): Promise<string> {
  const { data, error } = await supabase
    .from('attendance_import_batch')
    .insert({
      project_id: projectId,
      month: month,
      file_name: fileName,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`创建批次失败: ${error.message}`);
  }

  return data.id;
}

export async function insertAttendanceRecords(records: Partial<AttendanceRecord>[]) {
  // 转换成蛇形命名
  const dbRecords = records.map(r => ({
    batch_id: r.batchId,
    employee_id: r.employeeId,
    project_id: r.projectId,
    record_date: r.recordDate,
    first_punch_time: r.firstPunchTime,
    last_punch_time: r.lastPunchTime,
    raw_data: r.rawData,
    calculated_status: r.calculatedStatus,
  }));

  const { error } = await supabase
    .from('attendance_record')
    .insert(dbRecords);

  if (error) {
    throw new Error(`插入打卡记录失败: ${error.message}`);
  }
}

export async function getAttendanceRecords(projectId: string, month: string) {
  const startDate = `${month}-01`;
  const [yearStr, monthStr] = month.split('-');
  const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('attendance_record')
    .select(`
      id,
      batch_id,
      employee_id,
      project_id,
      record_date,
      first_punch_time,
      last_punch_time,
      raw_data,
      calculated_status
    `)
    .eq('project_id', projectId)
    .gte('record_date', startDate)
    .lte('record_date', endDate);

  if (error) {
    throw new Error(`获取打卡记录失败: ${error.message}`);
  }

  return data.map(row => ({
    id: row.id,
    batchId: row.batch_id,
    employeeId: row.employee_id,
    projectId: row.project_id,
    recordDate: row.record_date,
    firstPunchTime: row.first_punch_time,
    lastPunchTime: row.last_punch_time,
    rawData: row.raw_data,
    calculatedStatus: row.calculated_status,
  })) as AttendanceRecord[];
}

export async function deleteAttendanceBatch(batchId: string) {
  const { error } = await supabase
    .from('attendance_import_batch')
    .delete()
    .eq('id', batchId);

  if (error) {
    throw new Error(`删除批次失败: ${error.message}`);
  }
}
