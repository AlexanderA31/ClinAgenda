'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, UserPlus } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, type PatientView } from '@clinagenda/schemas';
import { phone } from '@/lib/format';
import { useDebounced, usePatientSearch } from '@/lib/queries';
import { useCan } from '@/lib/session';
import { DataTable } from '@/components/data-table/data-table';
import { useServerTable } from '@/components/data-table/use-server-table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { PatientForm } from '@/components/forms/patient-form';

export default function PacientesPage() {
  const router = useRouter();
  const canCreate = useCan('pacientes.editar');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const t = useServerTable([{ id: 'lastNames', desc: false }], 20);
  const debounced = useDebounced(q, 300);
  const data = usePatientSearch({ ...t.query, q: debounced || undefined });

  const columns = useMemo<ColumnDef<PatientView, unknown>[]>(
    () => [
      { id: 'lastNames', header: 'Apellidos', enableSorting: true, cell: ({ row }) => <span className="font-bold">{row.original.lastNames}</span> },
      { id: 'firstNames', header: 'Nombres', enableSorting: true, cell: ({ row }) => row.original.firstNames },
      {
        id: 'documentNumber',
        header: 'Documento',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.documentNumber ? (
            <span className="font-mono">{row.original.documentNumber}</span>
          ) : (
            <Badge tone="warn">{DOCUMENT_TYPE_LABELS.SIN_DOCUMENTO}</Badge>
          ),
      },
      {
        id: 'birthDate',
        header: 'Edad',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.age} años{row.original.birthDateEstimated && <span className="text-ink-3"> (aprox.)</span>}
          </span>
        ),
      },
      { id: 'phone', header: 'Teléfono', enableSorting: false, cell: ({ row }) => <span className="font-mono whitespace-nowrap">{phone(row.original.phone ?? row.original.guardian?.phone)}</span> },
      { id: 'code', header: 'Código', enableSorting: false, cell: ({ row }) => <span className="font-mono text-sm text-ink-3">{row.original.code}</span> },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Busque por nombre (con o sin tildes), cédula, teléfono o código. Antes de registrar a alguien, búsquelo: así no se duplica."
        actions={
          canCreate && (
            <Button size="lg" onClick={() => setCreating(true)}>
              <UserPlus /> Registrar paciente
            </Button>
          )
        }
      />
      <Field id="pacientes-q" label="Buscar paciente" className="max-w-xl" addon={<Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden />}>
        <Input value={q} onChange={(e) => (setQ(e.target.value), t.resetPage())} placeholder="Ej. maria lopez, 1712345675, 0991234567" className="pl-11" />
      </Field>
      <DataTable
        caption="Pacientes"
        columns={columns}
        data={data.data?.items ?? []}
        total={data.data?.total ?? 0}
        pageCount={data.data?.pageCount ?? 1}
        pagination={t.pagination}
        onPaginationChange={t.setPagination}
        sorting={debounced ? undefined : t.sorting}
        onSortingChange={debounced ? undefined : t.setSorting}
        loading={data.isFetching}
        onRowClick={(p) => router.push(`/pacientes/${p.id}`)}
        empty={<EmptyState title={debounced ? 'No lo encontramos' : 'Aún no hay pacientes'}>{debounced ? 'Pruebe con menos letras o con la cédula.' : 'Registre el primero.'}</EmptyState>}
        renderCard={(p) => (
          <button type="button" onClick={() => router.push(`/pacientes/${p.id}`)} className="flex w-full flex-col gap-1 rounded-lg border border-rule bg-surface px-4 py-3 text-left">
            <span className="font-bold">{p.fullName}</span>
            <span className="text-sm text-ink-2">
              {p.age} años · {p.documentNumber ?? 'sin documento'} · <span className="font-mono">{phone(p.phone ?? p.guardian?.phone)}</span>
            </span>
          </button>
        )}
      />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent side title="Registrar paciente" description="Solo nombre, fecha de nacimiento y una forma de contacto son indispensables.">
          {creating && <PatientForm onSaved={(p) => router.push(`/pacientes/${p.id}`)} onPickExisting={(p) => router.push(`/pacientes/${p.id}`)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
