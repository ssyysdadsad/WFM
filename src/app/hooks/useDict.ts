import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import { getDictItemsByTypeCode } from '@/app/services/dict.service';
import type { DictItem } from '@/app/types/dict';

const dictCache = new Map<string, DictItem[]>();

export function useDict(typeCode?: string) {
  const [items, setItems] = useState<DictItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!typeCode) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const cachedItems = dictCache.get(typeCode);
      if (cachedItems) {
        setItems(cachedItems);
        return;
      }

      const nextItems = await getDictItemsByTypeCode(typeCode);
      dictCache.set(typeCode, nextItems);
      setItems(nextItems);
    } catch (loadError) {
      setError(getErrorMessage(loadError, '加载字典失败'));
    } finally {
      setLoading(false);
    }
  }, [typeCode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    items,
    loading,
    error,
    refresh,
  };
}

export function invalidateDictCache(typeCode?: string) {
  if (!typeCode) {
    dictCache.clear();
    return;
  }

  dictCache.delete(typeCode);
}
