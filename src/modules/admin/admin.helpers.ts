/** Build the standard pagination meta block */
export function buildMeta(page: number, pageSize: number, total: number) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1,
  };
}

/** Derive account_status from the separate boolean fields */
export function computeAccountStatus(user: {
  is_deleted?: boolean;
  is_deactivated?: boolean;
  is_suspended?: boolean;
}): string {
  if (user.is_deleted) return 'deleted';
  if (user.is_deactivated) return 'deactivated';
  if (user.is_suspended) return 'suspended';
  return 'active';
}

/** Parse page / page_size from query strings with safe defaults */
export function parsePagination(
  page?: string,
  limit?: string,
  defaultLimit = 20,
  maxLimit = 100,
) {
  const p = Math.max(1, parseInt(page ?? '1') || 1);
  const ps = Math.min(
    Math.max(1, parseInt(limit ?? String(defaultLimit)) || defaultLimit),
    maxLimit,
  );
  return { page: p, pageSize: ps, offset: (p - 1) * ps };
}
