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
    isActive: row.is_active ?? false,
    status: row.status ?? 'draft',
    parentVersionId: row.parent_version_id ?? null,
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
    .select('id, item_name, item_code, dict_type!inner(type_code)')
    .eq('dict_type.type_code', 'publish_status')
    .eq('is_enabled', true)
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
      /not found|401|403|500|non-2xx|Failed to send a request to the Edge Function/i.test(error.message || ''));

  if (!shouldFallback) {
    throw toAppError(error, '发布排班版本失败');
  }

  // --- Fallback: load version info ---
  const { data: versionRows, error: loadError } = await supabase
    .from('schedule_version')
    .select('id, published_at, project_id, schedule_month')
    .eq('id', payload.scheduleVersionId)
    .limit(1);

  if (loadError || !versionRows?.[0]) {
    throw toAppError(loadError || new Error('未找到排班版本'), '发布排班版本失败');
  }

  const version = versionRows[0];

  if (version.published_at) {
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

  // --- Step 1: 将同项目同月份的旧版本标记为 is_active=false（保留数据用于查看矩阵） ---
  const { data: oldVersions } = await supabase
    .from('schedule_version')
    .select('id')
    .eq('project_id', version.project_id)
    .eq('schedule_month', version.schedule_month)
    .neq('id', payload.scheduleVersionId);

  const oldVersionIds = (oldVersions || []).map((v: any) => v.id);

  if (oldVersionIds.length > 0) {
    await supabase
      .from('schedule_version')
      .update({ is_active: false })
      .in('id', oldVersionIds);
  }

  // --- Step 4: 发布新版本并设为 is_active=true ---
  const publishedAt = new Date().toISOString();
  const { error: publishError } = await supabase
    .from('schedule_version')
    .update({
      publish_status_dict_item_id: publishedStatus.id,
      published_at: publishedAt,
      published_by_user_account_id: payload.operatorUserAccountId,
      is_active: true,
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

export async function deleteScheduleVersion(versionId: string) {
  const { error } = await supabase.rpc('cascade_delete_schedule_version', {
    p_version_id: versionId,
  });

  if (error) {
    throw toAppError(error, '删除排班版本失败');
  }
}

export async function getNextVersionNo(projectId: string, scheduleMonth: string) {
  const { data, error } = await supabase
    .from('schedule_version')
    .select('version_no')
    .eq('project_id', projectId)
    .eq('schedule_month', scheduleMonth)
    .order('version_no', { ascending: false })
    .limit(1);

  if (error) {
    throw toAppError(error, '查询版本号失败');
  }

  return (data?.[0]?.version_no ?? 0) + 1;
}

/** 恢复已归档版本为当前生效版本 */
export async function restoreScheduleVersion(versionId: string) {
  // 1. 查询版本信息
  const { data: versionRows, error: loadError } = await supabase
    .from('schedule_version')
    .select('id, project_id, schedule_month')
    .eq('id', versionId)
    .limit(1);

  if (loadError || !versionRows?.[0]) {
    throw toAppError(loadError || new Error('未找到排班版本'), '恢复版本失败');
  }

  const version = versionRows[0];

  // 2. 将同项目同月份所有版本设为 is_active=false
  await supabase
    .from('schedule_version')
    .update({ is_active: false })
    .eq('project_id', version.project_id)
    .eq('schedule_month', version.schedule_month);

  // 3. 将目标版本设为 is_active=true
  const { error: restoreError } = await supabase
    .from('schedule_version')
    .update({ is_active: true })
    .eq('id', versionId);

  if (restoreError) {
    throw toAppError(restoreError, '恢复版本失败');
  }
}

/** 从激活版本创建草稿副本（复制所有排班数据） */
export async function createDraftFromActive(activeVersionId: string, operatorUserAccountId?: string, operatorName?: string) {
  // 1. 查询源版本信息
  const { data: sourceRows, error: sourceError } = await supabase
    .from('schedule_version')
    .select('*')
    .eq('id', activeVersionId)
    .limit(1);

  if (sourceError || !sourceRows?.[0]) {
    throw toAppError(sourceError || new Error('未找到源版本'), '创建草稿失败');
  }

  const source = sourceRows[0];

  // 2. 检查是否已有该项目该月份的草稿版本
  const { data: existingDrafts } = await supabase
    .from('schedule_version')
    .select('id')
    .eq('project_id', source.project_id)
    .eq('schedule_month', source.schedule_month)
    .eq('status', 'draft')
    .limit(1);

  if (existingDrafts && existingDrafts.length > 0) {
    // 已有草稿，直接返回该草稿ID
    return existingDrafts[0].id as string;
  }

  // 3. 获取下一个版本号
  const nextNo = await getNextVersionNo(source.project_id, source.schedule_month);

  // 4. 查询草稿状态字典项
  const { data: dictItems } = await supabase
    .from('dict_item')
    .select('id, item_code')
    .eq('item_code', 'draft');
  const draftStatusId = dictItems?.[0]?.id || null;

  // 5. 创建新版本记录
  const { data: newVersion, error: createError } = await supabase
    .from('schedule_version')
    .insert({
      project_id: source.project_id,
      schedule_month: source.schedule_month,
      version_no: nextNo,
      generation_type: 'manual',
      publish_status_dict_item_id: draftStatusId,
      created_by_user_account_id: operatorUserAccountId ?? source.created_by_user_account_id,
      remark: `基于 v${source.version_no} 由 ${operatorName || '管理员'} 修改`,
      is_active: false,
      status: 'draft',
      parent_version_id: activeVersionId,
    })
    .select('id')
    .single();

  if (createError || !newVersion) {
    throw toAppError(createError || new Error('创建版本记录失败'), '创建草稿失败');
  }

  // 6. 批量复制排班数据
  const { data: scheduleRows, error: fetchError } = await supabase
    .from('schedule')
    .select('employee_id, department_id, project_id, task_id, device_id, schedule_date, shift_type_dict_item_id, schedule_code_dict_item_id, planned_hours, source_type, remark, sort_order')
    .eq('schedule_version_id', activeVersionId);

  if (fetchError) {
    throw toAppError(fetchError, '复制排班数据失败');
  }

  if (scheduleRows && scheduleRows.length > 0) {
    // 分批插入（每批500条）
    const batchSize = 500;
    for (let i = 0; i < scheduleRows.length; i += batchSize) {
      const batch = scheduleRows.slice(i, i + batchSize).map((row: any) => ({
        ...row,
        schedule_version_id: newVersion.id,
      }));
      const { error: insertError } = await supabase.from('schedule').insert(batch);
      if (insertError) {
        throw toAppError(insertError, '复制排班数据失败');
      }
    }
  }

  return newVersion.id as string;
}

/** 发布草稿版本（草稿→active，旧active→archived） */
export async function publishDraft(draftVersionId: string, operatorUserAccountId?: string) {
  // 1. 查询草稿版本信息
  const { data: draftRows, error: draftError } = await supabase
    .from('schedule_version')
    .select('*')
    .eq('id', draftVersionId)
    .limit(1);

  if (draftError || !draftRows?.[0]) {
    throw toAppError(draftError || new Error('未找到草稿版本'), '发布草稿失败');
  }

  const draft = draftRows[0];

  if (draft.status !== 'draft') {
    throw new AppError('只能发布状态为草稿的版本', 'INVALID_STATUS');
  }

  // 2. 将同项目同月份旧 active 版本归档
  await supabase
    .from('schedule_version')
    .update({ is_active: false, status: 'archived' })
    .eq('project_id', draft.project_id)
    .eq('schedule_month', draft.schedule_month)
    .eq('status', 'active');

  // 3. 查询发布状态字典项
  const { data: dictItems } = await supabase
    .from('dict_item')
    .select('id, item_code')
    .eq('item_code', 'published');
  const publishedStatusId = dictItems?.[0]?.id || null;

  // 4. 将草稿设为 active
  const publishedAt = new Date().toISOString();
  const { error: publishError } = await supabase
    .from('schedule_version')
    .update({
      status: 'active',
      is_active: true,
      published_at: publishedAt,
      published_by_user_account_id: operatorUserAccountId ?? null,
      publish_status_dict_item_id: publishedStatusId,
    })
    .eq('id', draftVersionId);

  if (publishError) {
    throw toAppError(publishError, '发布草稿失败');
  }

  return { success: true, publishedAt };
}
