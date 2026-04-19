import { authMode, supabase } from '@/app/lib/supabase/client';
import { AppError, toAppError } from '@/app/lib/supabase/errors';
import type { ReferenceOption } from '@/app/types/master-data';
import type {
  ApprovalStatusOption,
  ShiftChangeApprovePayload,
  ShiftChangeRequestRecord,
} from '@/app/types/shift-change';

function mapShiftChange(row: any): ShiftChangeRequestRecord {
  return {
    id: row.id,
    requestType: row.request_type,
    applicantEmployeeId: row.applicant_employee_id,
    targetEmployeeId: row.target_employee_id,
    originalScheduleId: row.original_schedule_id,
    targetScheduleId: row.target_schedule_id,
    targetDate: row.target_date,
    targetShiftTypeDictItemId: row.target_shift_type_dict_item_id,
    targetScheduleCodeDictItemId: row.target_schedule_code_dict_item_id,
    targetTaskId: row.target_task_id,
    targetDeviceId: row.target_device_id,
    reason: row.reason,
    approvalStatusDictItemId: row.approval_status_dict_item_id,
    approverUserAccountId: row.approver_user_account_id,
    approvedAt: row.approved_at,
    approvalComment: row.approval_comment,
  };
}

function mapApprovalStatus(row: any): ApprovalStatusOption {
  return {
    id: row.id,
    itemCode: row.item_code,
    itemName: row.item_name,
  };
}

export async function loadShiftChangeReferences() {
  const [employeeRes, statusRes] = await Promise.all([
    supabase.from('employee').select('id, full_name').order('full_name'),
    supabase.from('dict_item').select('id, item_name, item_code').order('sort_order'),
  ]);

  const firstError = employeeRes.error || statusRes.error;
  if (firstError) {
    throw toAppError(firstError, '加载调班审批基础数据失败');
  }

  return {
    employees: (employeeRes.data || []).map(
      (row: any): ReferenceOption => ({
        id: row.id,
        label: row.full_name,
      }),
    ),
    statuses: (statusRes.data || []).map(mapApprovalStatus),
  };
}

export async function listShiftChangeRequests() {
  const { data, error } = await supabase.from('shift_change_request').select('*').order('created_at', { ascending: false });

  if (error) {
    throw toAppError(error, '加载调班申请失败');
  }

  return (data || []).map(mapShiftChange);
}

export async function approveShiftChange(payload: ShiftChangeApprovePayload) {
  const { data, error } = await supabase.functions.invoke('shift-change-approve', {
    body: {
      shift_change_request_id: payload.shiftChangeRequestId,
      action: payload.action,
      approval_comment: payload.approvalComment,
      operator_user_account_id: payload.operatorUserAccountId,
    },
  });

  if (!error) {
    if (data?.success === false) {
      throw new AppError(data.message ?? '审批调班失败', data.error_code ?? 'FUNCTION_ERROR');
    }

    return data;
  }

  const isFallbackAllowed =
    authMode === 'mock' &&
    (error.code === 'FunctionsHttpError' ||
      /not found|401|403|Failed to send a request to the Edge Function/i.test(error.message || ''));

  if (!isFallbackAllowed) {
    throw toAppError(error, '审批调班失败');
  }

  const { data: requestRows, error: requestError } = await supabase
    .from('shift_change_request')
    .select('*')
    .eq('id', payload.shiftChangeRequestId)
    .limit(1);

  if (requestError || !requestRows?.[0]) {
    throw toAppError(requestError || new Error('未找到调班申请'), '审批调班失败');
  }

  const request = requestRows[0];
  const { data: statusRows, error: statusError } = await supabase
    .from('dict_item')
    .select('id, item_code')
    .in('item_code', ['approved', 'rejected']);

  if (statusError) {
    throw toAppError(statusError, '审批调班失败');
  }

  const targetStatus = statusRows?.find((item: any) => item.item_code === (payload.action === 'approve' ? 'approved' : 'rejected'));
  if (!targetStatus) {
    throw new AppError('未找到审批状态字典项', 'DICT_ITEM_MISSING');
  }

  const approvedAt = new Date().toISOString();

  if (payload.action === 'approve') {
    if (request.request_type === 'swap' && request.target_schedule_id) {
      const { data: schedules, error: scheduleError } = await supabase
        .from('schedule')
        .select('*')
        .in('id', [request.original_schedule_id, request.target_schedule_id]);

      if (scheduleError || !schedules || schedules.length < 2) {
        throw toAppError(scheduleError || new Error('缺少目标排班数据'), '审批调班失败');
      }

      const original = schedules.find((item: any) => item.id === request.original_schedule_id);
      const target = schedules.find((item: any) => item.id === request.target_schedule_id);

      await Promise.all([
        supabase.from('schedule').update({
          employee_id: target.employee_id,
          department_id: target.department_id,
          task_id: target.task_id,
          device_id: target.device_id,
          shift_type_dict_item_id: target.shift_type_dict_item_id,
          schedule_code_dict_item_id: target.schedule_code_dict_item_id,
          planned_hours: target.planned_hours,
          remark: '通过调班审批执行互换',
        }).eq('id', original.id),
        supabase.from('schedule').update({
          employee_id: original.employee_id,
          department_id: original.department_id,
          task_id: original.task_id,
          device_id: original.device_id,
          shift_type_dict_item_id: original.shift_type_dict_item_id,
          schedule_code_dict_item_id: original.schedule_code_dict_item_id,
          planned_hours: original.planned_hours,
          remark: '通过调班审批执行互换',
        }).eq('id', target.id),
      ]);
    }

    if (request.request_type === 'direct_change') {
      const { error: updateScheduleError } = await supabase
        .from('schedule')
        .update({
          schedule_date: request.target_date,
          shift_type_dict_item_id: request.target_shift_type_dict_item_id,
          schedule_code_dict_item_id: request.target_schedule_code_dict_item_id,
          task_id: request.target_task_id,
          device_id: request.target_device_id,
          remark: request.reason,
        })
        .eq('id', request.original_schedule_id);

      if (updateScheduleError) {
        throw toAppError(updateScheduleError, '审批调班失败');
      }
    }
  }

  const { error: updateError } = await supabase
    .from('shift_change_request')
    .update({
      approval_status_dict_item_id: targetStatus.id,
      approver_user_account_id: payload.operatorUserAccountId,
      approved_at: approvedAt,
      approval_comment: payload.approvalComment ?? null,
    })
    .eq('id', payload.shiftChangeRequestId);

  if (updateError) {
    throw toAppError(updateError, '审批调班失败');
  }

  return {
    success: true,
    message: payload.action === 'approve' ? '审批通过' : '审批拒绝',
  };
}
