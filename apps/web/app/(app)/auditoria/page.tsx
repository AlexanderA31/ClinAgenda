'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AuditEntryView, Paginated } from '@clinagenda/schemas';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { DataTable } from '@/components/data-table/data-table';
import { useServerTable } from '@/components/data-table/use-server-table';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { RequirePermission } from '@/components/layout/require-role';

const ENTITIES: Record<string, string> = {
  Appointment: 'Citas',
  Patient: 'Pacientes',
  User: 'Usuarios',
  Doctor: 'Médicos',
  Clinic: 'Clínicas',
  ClinicClosure: 'Cierres',
  WaitlistEntry: 'Lista de espera',
  ImportJob: 'Importaciones',
};

const ACTION_TONE: Record<string, 'danger' | 'warn' | 'info' | 'good' | 'neutral'> = {
  CANCEL: 'danger',
  LOGIN_FAILED: 'danger',
  RESTORE: 'good',
  CREATE: 'good',
  RESCHEDULE: 'warn',
  MERGE: 'warn',
  VIEW_CLINICAL: 'info',
};

export default function AuditPage() {
  return (
    <RequirePermission permission="auditoria.ver">
      <Audit />
    </RequirePermission>
  );
}

function Audit() {
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const t = useServerTable([], 30);
  const data = useQuery({
    queryKey: ['audit', entity, from, t.query.page],
    queryFn: () => api<Paginated<AuditEntryView>>('/audit', { query: { entity: entity || undefined, from: from || undefined, page: t.query.page, pageSize: 30 } }),
    placeholderData: (p) => p,
  });
  const columns = useMemo<ColumnDef<AuditEntryView, unknown>[]>(
    () => [
      { id: 'at', header: 'Cuándo', cell: ({ row }) => <span className="tabular whitespace-nowrap">{dateTime(row.original.at)}</span> },
      { id: 'user', header: 'Quién', cell: ({ row }) => <span className="font-bold">{row.original.user?.fullName ?? 'Sistema'}</span> },
      { id: 'action', header: 'Acción', cell: ({ row }) => <Badge tone={ACTION_TONE[row.original.action] ?? 'neutral'}>{row.original.action}</Badge> },
      { id: 'summary', header: 'Qué pasó', cell: ({ row }) => <span className="block min-w-72">{row.original.summary}</span> },
      { id: 'ip', header: 'Equipo', cell: ({ row }) => <span className="font-mono text-sm text-ink-3">{row.original.ip ?? '—'}</span> },
    ],
    [],
  );
  return (
    <>
      <PageHeader
        title="Bitácora"
        description="Cada cambio queda registrado con quién, cuándo y qué había antes. Nadie puede editar ni borrar esta lista, ni siquiera la dirección."
      />
      <div className="flex flex-wrap gap-3">
        <Field id="audit-entity" label="Sobre">
          <Select value={entity} onChange={(e) => (setEntity(e.target.value), t.resetPage())}>
            <option value="">Todo</option>
            {Object.entries(ENTITIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="audit-from" label="Desde">
          <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), t.resetPage())} />
        </Field>
      </div>
      <DataTable
        caption="Bitácora de auditoría"
        columns={columns}
        data={data.data?.items ?? []}
        total={data.data?.total ?? 0}
        pageCount={data.data?.pageCount ?? 1}
        pagination={t.pagination}
        onPaginationChange={t.setPagination}
        loading={data.isFetching}
        empty={<EmptyState title="Sin registros" />}
        renderCard={(e) => (
          <div className="flex flex-col gap-1 rounded-lg border border-rule bg-surface px-4 py-3">
            <span className="flex justify-between gap-2 text-sm text-ink-3">
              <span className="tabular">{dateTime(e.at)}</span>
              <Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>{e.action}</Badge>
            </span>
            <span className="font-bold">{e.user?.fullName ?? 'Sistema'}</span>
            <span>{e.summary}</span>
          </div>
        )}
      />
    </>
  );
}
