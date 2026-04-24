import { supabase } from '@/app/lib/supabase/client';
import { toAppError } from '@/app/lib/supabase/errors';
import type { DictItem, DictItemFormValues, DictType, DictTypeFormValues } from '@/app/types/dict';

function mapDictType(row: any): DictType {
  return {
    id: row.id,
    typeCode: row.type_code,
    typeName: row.type_name,
    description: row.description,
    extraConfig: row.extra_config,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
  };
}

function mapDictItem(row: any): DictItem {
  return {
    id: row.id,
    dictTypeId: row.dict_type_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    description: row.description,
    extraConfig: row.extra_config,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
  };
}

export async function listDictTypes() {
  const { data, error } = await supabase.from('dict_type').select('*').order('sort_order').order('type_code');

  if (error) {
    throw toAppError(error, '加载字典类型失败');
  }

  return (data ?? []).map(mapDictType);
}

export async function listDictItems(dictTypeId: string) {
  const { data, error } = await supabase
    .from('dict_item')
    .select('*')
    .eq('dict_type_id', dictTypeId)
    .order('sort_order')
    .order('item_code');

  if (error) {
    throw toAppError(error, '加载字典项失败');
  }

  return (data ?? []).map(mapDictItem);
}

export async function getDictItemsByTypeCode(typeCode: string) {
  const { data: dictType, error: typeError } = await supabase
    .from('dict_type')
    .select('id')
    .eq('type_code', typeCode)
    .maybeSingle();

  if (typeError) {
    throw toAppError(typeError, '加载字典类型失败');
  }

  if (!dictType) {
    return [];
  }

  return listDictItems(dictType.id);
}

export async function saveDictType(payload: DictTypeFormValues, editingId?: string) {
  const values = {
    type_code: payload.typeCode,
    type_name: payload.typeName,
    description: payload.description ?? null,
    sort_order: payload.sortOrder ?? 0,
    is_enabled: payload.isEnabled ?? true,
  };

  if (editingId) {
    const { error } = await supabase.from('dict_type').update(values).eq('id', editingId);
    if (error) {
      throw toAppError(error, '保存字典类型失败');
    }
    return;
  }

  const { error } = await supabase.from('dict_type').insert(values);
  if (error) {
    throw toAppError(error, '保存字典类型失败');
  }
}

export async function saveDictItem(dictTypeId: string, payload: DictItemFormValues, editingId?: string) {
  const values = {
    dict_type_id: dictTypeId,
    item_code: payload.itemCode,
    item_name: payload.itemName,
    description: payload.description ?? null,
    extra_config: payload.extraConfig ?? null,
    sort_order: payload.sortOrder ?? 0,
    is_enabled: payload.isEnabled ?? true,
  };

  if (editingId) {
    const { error } = await supabase.from('dict_item').update(values).eq('id', editingId);
    if (error) {
      throw toAppError(error, '保存字典项失败');
    }
    return;
  }

  const { error } = await supabase.from('dict_item').insert(values);
  if (error) {
    throw toAppError(error, '保存字典项失败');
  }
}

export async function deleteDictItem(id: string) {
  const { error } = await supabase.from('dict_item').delete().eq('id', id);
  if (error) {
    throw toAppError(error, '删除字典项失败');
  }
}
