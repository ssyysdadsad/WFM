export function applyTextSearch<T extends { ilike: (column: string, value: string) => T }>(
  query: T,
  field: string | undefined,
  keyword: string | undefined,
) {
  if (!field || !keyword?.trim()) {
    return query;
  }

  return query.ilike(field, `%${keyword.trim()}%`);
}

export function normalizePagination(page = 1, pageSize = 20) {
  return {
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1,
  };
}
