type ErrorLike = {
  message?: string;
  code?: string;
  details?: string;
};

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code = 'UNKNOWN_ERROR',
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const DB_ERROR_MESSAGES: Record<string, string> = {
  '23505': '数据已存在，请检查是否重复提交',
  '23503': '存在关联数据，当前操作无法完成',
  '23514': '提交的数据不符合业务规则',
  PGRST116: '未找到对应数据',
};

export function toAppError(error: unknown, fallbackMessage = '操作失败') {
  if (error instanceof AppError) {
    return error;
  }

  const source = (error ?? {}) as ErrorLike;
  const code = source.code ?? 'UNKNOWN_ERROR';
  const message = DB_ERROR_MESSAGES[code] ?? source.message ?? fallbackMessage;

  return new AppError(message, code, source.details);
}

export function getErrorMessage(error: unknown, fallbackMessage?: string) {
  return toAppError(error, fallbackMessage).message;
}
