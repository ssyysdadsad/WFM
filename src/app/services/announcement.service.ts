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
    isPinned: row.is_pinned ?? false,
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

/**
 * 创建自定义公告类型（写入 dict_item）
 */
export async function createAnnouncementType(typeName: string): Promise<AnnouncementTypeOption> {
  // 先获取 dict_type id
  const { data: typeRows, error: typeError } = await supabase
    .from('dict_type')
    .select('id')
    .eq('type_code', 'announcement_type')
    .limit(1);

  if (typeError) throw toAppError(typeError, '加载公告类型失败');
  if (!typeRows?.[0]?.id) throw new AppError('公告类型字典未初始化', 'NOT_FOUND');

  const dictTypeId = typeRows[0].id;

  // 获取当前最大 sort_order
  const { data: maxRows } = await supabase
    .from('dict_item')
    .select('sort_order')
    .eq('dict_type_id', dictTypeId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextSort = ((maxRows?.[0] as any)?.sort_order || 0) + 1;

  // 生成 item_code（拼音或下划线编码）
  const itemCode = `custom_${Date.now()}`;

  const { data, error } = await supabase
    .from('dict_item')
    .insert({
      dict_type_id: dictTypeId,
      item_name: typeName,
      item_code: itemCode,
      sort_order: nextSort,
      is_enabled: true,
    })
    .select('id, item_name, item_code')
    .single();

  if (error) throw toAppError(error, '创建公告类型失败');

  return {
    id: data.id,
    itemName: data.item_name,
    itemCode: data.item_code,
  };
}

export async function listAnnouncements() {
  const { data, error } = await supabase
    .from('announcement')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw toAppError(error, '加载公告失败');
  }

  return (data || []).map(mapAnnouncement);
}

export async function saveAnnouncement(
  payload: Omit<AnnouncementFormValues, 'visibilityScopeConfig'> & { visibilityScopeConfigText?: string; isPinned?: boolean },
  operatorUserAccountId: string,
  editingId?: string,
) {
  const values: Record<string, any> = {
    title: payload.title,
    announcement_type_dict_item_id: payload.announcementTypeDictItemId,
    content: payload.content,
    visibility_scope_type: payload.visibilityScopeType,
    visibility_scope_config: parseVisibilityScopeConfig(payload.visibilityScopeConfigText),
    published_by_user_account_id: operatorUserAccountId,
    published_at: payload.publishedAt,
  };

  if (payload.isPinned !== undefined) {
    values.is_pinned = payload.isPinned;
  }

  if (editingId) {
    const { error } = await supabase.from('announcement').update(values).eq('id', editingId);
    if (error) {
      throw toAppError(error, '保存公告失败');
    }
    return;
  }

  values.is_pinned = payload.isPinned ?? false;
  const { error } = await supabase.from('announcement').insert(values);
  if (error) {
    throw toAppError(error, '保存公告失败');
  }
}

/**
 * 切换置顶状态
 */
export async function toggleAnnouncementPin(id: string, isPinned: boolean) {
  const { error } = await supabase
    .from('announcement')
    .update({ is_pinned: isPinned })
    .eq('id', id);

  if (error) {
    throw toAppError(error, '更新置顶状态失败');
  }
}

export async function deleteAnnouncement(id: string) {
  const { error } = await supabase.from('announcement').delete().eq('id', id);
  if (error) {
    throw toAppError(error, '删除公告失败');
  }
}
