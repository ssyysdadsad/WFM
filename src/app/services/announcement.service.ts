import { supabase } from '@/app/lib/supabase/client';
import { AppError, toAppError } from '@/app/lib/supabase/errors';
import type {
  AnnouncementFormValues,
  AnnouncementRecord,
  AnnouncementTypeOption,
} from '@/app/types/announcement';

function mapAnnouncement(row: any): AnnouncementRecord {
  return {
    id: row.id,
    title: row.title,
    announcementTypeDictItemId: row.announcement_type_dict_item_id,
    content: row.content,
    visibilityScopeType: row.visibility_scope_type,
    visibilityScopeConfig: row.visibility_scope_config,
    publishedByUserAccountId: row.published_by_user_account_id,
    publishedAt: row.published_at,
  };
}

function parseVisibilityScopeConfig(input?: string) {
  if (!input?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AppError('可见范围配置必须是 JSON 对象', 'VALIDATION_FAILED');
    }
    return parsed as Record<string, any>;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('可见范围配置 JSON 格式错误', 'VALIDATION_FAILED');
  }
}

export async function listAnnouncementTypes() {
  const { data: typeRows, error: typeError } = await supabase
    .from('dict_type')
    .select('id')
    .eq('type_code', 'announcement_type')
    .limit(1);

  if (typeError) {
    throw toAppError(typeError, '加载公告类型失败');
  }

  if (!typeRows?.[0]?.id) {
    return [];
  }

  const { data, error } = await supabase
    .from('dict_item')
    .select('id, item_name, item_code')
    .eq('dict_type_id', typeRows[0].id)
    .order('sort_order');

  if (error) {
    throw toAppError(error, '加载公告类型失败');
  }

  return (data || []).map(
    (row: any): AnnouncementTypeOption => ({
      id: row.id,
      itemName: row.item_name,
      itemCode: row.item_code,
    }),
  );
}

export async function listAnnouncements() {
  const { data, error } = await supabase
    .from('announcement')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw toAppError(error, '加载公告失败');
  }

  return (data || []).map(mapAnnouncement);
}

export async function saveAnnouncement(
  payload: Omit<AnnouncementFormValues, 'visibilityScopeConfig'> & { visibilityScopeConfigText?: string },
  operatorUserAccountId: string,
  editingId?: string,
) {
  const values = {
    title: payload.title,
    announcement_type_dict_item_id: payload.announcementTypeDictItemId,
    content: payload.content,
    visibility_scope_type: payload.visibilityScopeType,
    visibility_scope_config: parseVisibilityScopeConfig(payload.visibilityScopeConfigText),
    published_by_user_account_id: operatorUserAccountId,
    published_at: payload.publishedAt,
  };

  if (editingId) {
    const { error } = await supabase.from('announcement').update(values).eq('id', editingId);
    if (error) {
      throw toAppError(error, '保存公告失败');
    }
    return;
  }

  const { error } = await supabase.from('announcement').insert(values);
  if (error) {
    throw toAppError(error, '保存公告失败');
  }
}
