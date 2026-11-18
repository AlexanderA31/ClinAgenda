'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  total: number;
  pageCount: number;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  loading?: boolean;
  /** Vista de tarjeta para celular (debajo de 768 px). Sin ella, la tabla se desplaza horizontalmente. */
  renderCard?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  caption?: string;
}

/**
 * Tabla de datos con paginación y orden del lado del servidor (la API devuelve solo la página pedida),
 * así sigue rápida con miles de citas.
 */
export function DataTable<T>({
  columns,
  data,
  total,
  pageCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  loading,
  renderCard,
  onRowClick,
  empty,
  caption,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: { pagination, sorting: sorting ?? [] },
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: false,
    onPaginationChange,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
  });

  const from = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const to = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize);

  return (
    <div className="flex flex-col gap-3">
      <div className={cn('rounded-lg border border-rule bg-surface', renderCard && 'hidden md:block')}>
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort() && !!onSortingChange;
                  const dir = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 uppercase hover:text-ink">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === 'asc' ? <ArrowUp className="size-4" /> : dir === 'desc' ? <ArrowDown className="size-4" /> : <ArrowUpDown className="size-4 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading && !data.length
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(onRowClick && 'cursor-pointer')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {!loading && !data.length && <div className="p-4">{empty}</div>}
      </div>

      {renderCard && (
        <ul className="flex flex-col gap-2 md:hidden">
          {loading && !data.length && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          {data.map((row, i) => (
            <li key={i}>{renderCard(row)}</li>
          ))}
          {!loading && !data.length && <li>{empty}</li>}
        </ul>
      )}

      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Paginación">
        <p className="tabular text-ink-2" aria-live="polite">
          {total === 0 ? 'Sin resultados' : `Mostrando ${from}–${to} de ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft /> Anterior
          </Button>
          <span className="tabular px-1 text-ink-2">
            Página {pagination.pageIndex + 1} de {Math.max(1, pageCount)}
          </span>
          <Button variant="secondary" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Siguiente <ChevronRight />
          </Button>
        </div>
      </nav>
    </div>
  );
}
