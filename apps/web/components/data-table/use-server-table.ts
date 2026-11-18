'use client';

import { useState } from 'react';
import type { PaginationState, SortingState } from '@tanstack/react-table';

/** Estado de paginación/orden listo para mandar como query a la API. */
export function useServerTable(defaultSort: SortingState = [], pageSize = 20) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });
  const [sorting, setSorting] = useState<SortingState>(defaultSort);
  const query = {
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    sortBy: sorting[0]?.id,
    sortDir: sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined,
  } as const;
  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));
  return { pagination, setPagination, sorting, setSorting, query, resetPage };
}
