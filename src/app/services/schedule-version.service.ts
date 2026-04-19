import { authMode, supabase } from '@/app/lib/supabase/client';
import { AppError, toAppError } from '@/app/lib/supabase/errors';
import type { ReferenceOption } from '@/app/types/master-data';
import type {
  SchedulePublishPayload,
  ScheduleVersionFormValues,
  ScheduleVersionRecord,
} from '@/app/types/schedule-version';

function mapReferenceOption(row: any): ReferenceOption {
  return {
    id: row.id,
    label: row.project_name ?? row.item_name,
    code: row.project_code ?? row.item_code,
  };
}

function mapScheduleVersion(row: any): ScheduleVersionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    scheduleMonth: row.schedule_month,
    versionNo: row.version_no,
    publishStatusDictItemId: row.publish_status_dict_item_id,
    generationType: row.generation_type,
    createdByUserAccountId: row.created_by_user_account_id,
    publishedAt: row.published_at,
    publishedByUserAccountId: row.published_by_user_account_id,
    remark: row.remark,
  };
}

export async function listScheduleVersions() {
  const { data, error } = await supabase.from('schedule_version').select('*').order('created_at', { ascending: false });

  if (error) {
    throw toAppError(error, '加载排班版本失败');
  }

  return (data ?? []).map(mapScheduleVersion);
}

export async function listScheduleVersionProjects() {
  const { data, error } = await supabase.from('project').select('id, project_name, project_code').order('project_name');

  if (error) {
    throw toAppError(error, '加载项目失败');
  }

  return (data ?? []).map(mapReferenceOption);
}

export async function listPublishStatusOptions() {
  const { data, error } = await supabase
    .from('dict_item')
    .select('id, item_name, item_code')
    .order('sort_order')
    .order('item_name');

  if (error) {
    throw toAppError(error, '加载发布状态失败');
  }

  return (data ?? []).map(mapReferenceOption);
}

export async function createScheduleVersion(payload: ScheduleVersionFormValues, operatorUserAccountId?: string) {
  const { error } = await supabase.from('schedule_version').insert({
    project_id: payload.projectId,
    schedule_month: payload.scheduleMonth,
    version_no: payload.versionNo,
    generation_type: payload.generationType,
    publish_status_dict_item_id: payload.publishStatusDictItemId ?? null,
    created_by_user_account_id: operatorUserAccountId ?? null,
    remark: payload.remark ?? null,
  });

  if (error) {
    throw toAppError(error, '创建排班版本失败');
  }
}

export async function publishScheduleVersion(payload: SchedulePublishPayload) {
  const { data, error } = await supabase.functions.invoke('schedule-publish', {
    body: {
      schedule_version_id: payload.scheduleVersionId,
      operator_user_account_id: payload.operatorUserAccountId,
      create_announcement: payload.createAnnouncement ?? false,
      announcement_title: payload.announcementTitle,
    },
  });

  if (!error) {
    if (data?.success === false) {
      throw new AppError(data.message ?? '发布排班版本失败', data.error_code ?? 'FUNCTION_ERROR');
    }

    return data;
  }

  const shouldFallback =
    authMode === 'mock' &&
    (error.code === 'FunctionsHttpError' ||
      /not found|401|403|Failed to send a request to the Edge Function/i.test(error.message || ''));

  if (!shouldFallback) {
    throw toAppError(error, '发布排班版本失败');
  }

  const { data: versionRows, error: loadError } = await supabase
    .from('schedule_version')
    .select('id, published_at')
    .eq('id', payload.scheduleVersionId)
    .limit(1);

  if (loadError || !versionRows?.[0]) {
    throw toAppError(loadError || new Error('未找到排班版本'), '发布排班版本失败');
  }

  if (versionRows[0].published_at) {
    throw new AppError('该排班版本已发布，禁止重复发布', 'SCHEDULE_VERSION_ALREADY_PUBLISHED');
  }

  const { data: dictItems, error: dictError } = await supabase
    .from('dict_item')
    .select('id, item_code')
    .in('item_code', ['published', 'schedule_publish']);

  if (dictError) {
    throw toAppError(dictError, '发布排班版本失败');
  }

  const publishedStatus = dictItems?.find((item: any) => item.item_code === 'published');
  if (!publishedStatus) {
    throw new AppError('缺少发布状态字典项', 'DICT_STATUS_MISSING');
  }

  const publishedAt = new Date().toISOString();
  const { error: publishError } = await supabase
    .from('schedule_version')
    .update({
      publish_status_dict_item_id: publishedStatus.id,
      published_at: publishedAt,
      published_by_user_account_id: payload.operatorUserAccountId,
    })
    .eq('id', payload.scheduleVersionId);

  if (publishError) {
    throw toAppError(publishError, '发布排班版本失败');
  }

  if (payload.createAnnouncement) {
    const announcementType = dictItems?.find((item: any) => item.item_code === 'schedule_publish');
    if (announcementType) {
      const { error: announcementError } = await supabase.from('announcement').insert({
        title: payload.announcementTitle || `${new Date(publishedAt).getMonth() + 1}月排班已发布`,
        announcement_type_dict_item_id: announcementType.id,
        content: '排班版本已发布，请相关人员及时查看。',
        visibility_scope_type: 'all',
        visibility_scope_config: null,
        published_by_user_account_id: payload.operatorUserAccountId,
        published_at: publishedAt,
      });

      if (announcementError) {
        throw toAppError(announcementError, '发布排班版本失败');
      }
    }
  }

  return {
    success: true,
    error_code: null,
    message: 'schedule published',
    data: {
      schedule_version_id: payload.scheduleVersionId,
      published_at: publishedAt,
    },
  };
}
