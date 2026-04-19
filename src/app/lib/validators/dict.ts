import type { Json } from '@/app/types/database';
import { AppError } from '@/app/lib/supabase/errors';

function assertObject(value: Json | null) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseDictExtraConfig(input: string | undefined) {
  if (!input?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(input) as Json;

    if (parsed !== null && !assertObject(parsed)) {
      throw new AppError('扩展配置必须是 JSON 对象', 'VALIDATION_FAILED');
    }

    return parsed;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('扩展配置 JSON 格式错误', 'VALIDATION_FAILED');
  }
}
