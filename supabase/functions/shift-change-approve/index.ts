import { createClient } from 'npm:@supabase/supabase-js@2';

type ApprovalPayload = {
  shift_change_request_id?: string;
  action?: 'approve' | 'reject';
  approval_comment?: string;
  operator_user_account_id?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim();
}

async function resolveOperatorUserAccountId(
  supabase: ReturnType<typeof createClient>,
  request: Request,
  fallbackOperatorUserAccountId?: string,
) {
  const accessToken = getBearerToken(request);

  if (accessToken) {
    const { data: authUserData, error: authUserError } = await supabase.auth.getUser(accessToken);
    if (authUserError) {
      throw new Error(authUserError.message || '获取当前登录用户失败');
    }

    const authUserId = authUserData.user?.id;
    if (authUserId) {
      const { data: userAccount, error: accountError } = await supabase
        .from('user_account')
        .select('id')
        .eq('auth_user_id', authUserId)
        .eq('is_enabled', true)
        .maybeSingle();

      if (accountError) {
        throw new Error(accountError.message || '加载操作者账号失败');
      }

      if (userAccount?.id) {
        return userAccount.id;
      }
    }
  }

  if (fallbackOperatorUserAccountId) {
    return fallbackOperatorUserAccountId;
  }

  throw new Error('未解析到当前操作者账号');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = (await request.json()) as ApprovalPayload;

    if (!payload.shift_change_request_id || !payload.action) {
      return Response.json(
        {
          success: false,
          error_code: 'VALIDATION_FAILED',
          message: 'shift_change_request_id、action 为必填字段',
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        {
          success: false,
          error_code: 'SERVER_CONFIG_MISSING',
          message: '缺少 Supabase 服务端配置',
        },
        { status: 500, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const operatorUserAccountId = await resolveOperatorUserAccountId(
      supabase,
      request,
      payload.operator_user_account_id,
    );

    const { data: requestRows, error: requestError } = await supabase
      .from('shift_change_request')
      .select('*')
      .eq('id', payload.shift_change_request_id)
      .limit(1);

    const requestRow = requestRows?.[0];
    if (requestError || !requestRow) {
      return Response.json(
        {
          success: false,
          error_code: 'SHIFT_CHANGE_REQUEST_NOT_FOUND',
          message: '未找到对应调班申请',
        },
        { status: 404, headers: corsHeaders },
      );
    }

    const { data: statusRows, error: statusError } = await supabase
      .from('dict_item')
      .select('id, item_code')
      .in('item_code', ['approved', 'rejected']);

    if (statusError) {
      return Response.json(
        {
          success: false,
          error_code: statusError.code || 'DICT_ITEM_LOAD_FAILED',
          message: statusError.message,
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const targetStatus = statusRows?.find((item) => item.item_code === (payload.action === 'approve' ? 'approved' : 'rejected'));
    if (!targetStatus) {
      return Response.json(
        {
          success: false,
          error_code: 'DICT_ITEM_MISSING',
          message: '缺少审批状态字典项',
        },
        { status: 400, headers: corsHeaders },
      );
    }

    if (requestRow.approved_at) {
      return Response.json(
        {
          success: false,
          error_code: 'SHIFT_CHANGE_ALREADY_PROCESSED',
          message: '该调班申请已处理，禁止重复审批',
        },
        { status: 409, headers: corsHeaders },
      );
    }

    if (payload.action === 'approve') {
      if (requestRow.request_type === 'swap') {
        if (!requestRow.target_schedule_id || !requestRow.target_employee_id) {
          return Response.json(
            {
              success: false,
              error_code: 'SHIFT_CHANGE_SWAP_FIELDS_MISSING',
              message: '互换调班缺少目标班次或目标员工',
            },
            { status: 400, headers: corsHeaders },
          );
        }

        const { data: schedules, error: scheduleError } = await supabase
          .from('schedule')
          .select('*')
          .in('id', [requestRow.original_schedule_id, requestRow.target_schedule_id]);

        if (scheduleError || !schedules || schedules.length < 2) {
          return Response.json(
            {
              success: false,
              error_code: 'SCHEDULE_LOAD_FAILED',
              message: scheduleError?.message || '缺少互换调班对应的班表记录',
            },
            { status: 400, headers: corsHeaders },
          );
        }

        const originalSchedule = schedules.find((item) => item.id === requestRow.original_schedule_id);
        const targetSchedule = schedules.find((item) => item.id === requestRow.target_schedule_id);

        await Promise.all([
          supabase.from('schedule').update({
            employee_id: targetSchedule?.employee_id,
            department_id: targetSchedule?.department_id,
            task_id: targetSchedule?.task_id,
            device_id: targetSchedule?.device_id,
            shift_type_dict_item_id: targetSchedule?.shift_type_dict_item_id,
            schedule_code_dict_item_id: targetSchedule?.schedule_code_dict_item_id,
            planned_hours: targetSchedule?.planned_hours,
            remark: '通过调班审批执行互换',
          }).eq('id', originalSchedule?.id),
          supabase.from('schedule').update({
            employee_id: originalSchedule?.employee_id,
            department_id: originalSchedule?.department_id,
            task_id: originalSchedule?.task_id,
            device_id: originalSchedule?.device_id,
            shift_type_dict_item_id: originalSchedule?.shift_type_dict_item_id,
            schedule_code_dict_item_id: originalSchedule?.schedule_code_dict_item_id,
            planned_hours: originalSchedule?.planned_hours,
            remark: '通过调班审批执行互换',
          }).eq('id', targetSchedule?.id),
        ]);
      }

      if (requestRow.request_type === 'direct_change') {
        if (!requestRow.target_date || !requestRow.target_shift_type_dict_item_id || !requestRow.target_schedule_code_dict_item_id) {
          return Response.json(
            {
              success: false,
              error_code: 'SHIFT_CHANGE_DIRECT_FIELDS_MISSING',
              message: '直接变更缺少目标日期或班次信息',
            },
            { status: 400, headers: corsHeaders },
          );
        }

        const { error: updateScheduleError } = await supabase
          .from('schedule')
          .update({
            schedule_date: requestRow.target_date,
            shift_type_dict_item_id: requestRow.target_shift_type_dict_item_id,
            schedule_code_dict_item_id: requestRow.target_schedule_code_dict_item_id,
            task_id: requestRow.target_task_id,
            device_id: requestRow.target_device_id,
            remark: requestRow.reason,
          })
          .eq('id', requestRow.original_schedule_id);

        if (updateScheduleError) {
          return Response.json(
            {
              success: false,
              error_code: updateScheduleError.code || 'SCHEDULE_UPDATE_FAILED',
              message: updateScheduleError.message,
            },
            { status: 400, headers: corsHeaders },
          );
        }
      }
    }

    const approvedAt = new Date().toISOString();
    const { error: updateRequestError } = await supabase
      .from('shift_change_request')
      .update({
        approval_status_dict_item_id: targetStatus.id,
        approver_user_account_id: operatorUserAccountId,
        approved_at: approvedAt,
        approval_comment: payload.approval_comment || null,
      })
      .eq('id', payload.shift_change_request_id);

    if (updateRequestError) {
      return Response.json(
        {
          success: false,
          error_code: updateRequestError.code || 'SHIFT_CHANGE_UPDATE_FAILED',
          message: updateRequestError.message,
        },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json(
      {
        success: true,
        error_code: null,
        message: payload.action === 'approve' ? 'shift change approved' : 'shift change rejected',
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error_code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
