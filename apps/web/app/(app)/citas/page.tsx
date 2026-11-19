'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { APPOINTMENT_STATUS_LABELS, type AppointmentView } from '@clinagenda/schemas';
import { addDays, phone, shortDate, time, todayIso } from '@/lib/format';
import { useAppointments, useDebounced, useWorkClinics } from '@/lib/queries';
import { DataTable } from '@/components/data-table/data-table';
import { useServerTable } from '@/components/data-table/use-server-table';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { StatusBadge } from '@/components/appointments/status-badge';
import { AppointmentPanel } from '@/components/appointments/appointment-panel';

export default function CitasPage() {
  const clinics = useWorkClinics();
  const [q, setQ] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(addDays(todayIso(), -7));
  const [to, setTo] = useState(addDays(todayIso(), 14));
  const [openId, setOpenId] = useState<string | null>(null);
  const t = useServerTable([{ id: 'startsAt', desc: false }], 25);
  const debounced = useDebounced(q, 350);

  const data = useAppointments({ ...t.query, q: debounced || undefined, clinicId: clinicId || undefined, status: status || undefined, from, to });

  const columns = useMemo<ColumnDef<AppointmentView, unknown>[]>(
    () => [
      { id: 'startsAt', header: 'Fecha y hora', enableSorting: true, cell: ({ row }) => <span className="tabular whitespace-nowrap">{shortDate(row.original.startsAt)} <span className="font-mono font-medium">{time(row.original.startsAt)}</span></span> },
      { id: 'patient', header: 'Paciente', enableSorting: false, cell: ({ row }) => <span className="font-bold">{row.original.patient.fullName}</span> },
      { id: 'phone', header: 'Teléfono', enableSorting: false, cell: ({ row }) => <span className="font-mono whitespace-nowrap">{phone(row.original.patient.phone)}</span> },
      { id: 'doctor', header: 'Médico', enableSorting: false, cell: ({ row }) => row.original.doctor.fullName },
      { id: 'clinic', header: 'Clínica', enableSorting: false, cell: ({ row }) => row.original.clinic.name.replace('Clínica ', '') },
      { id: 'status', header: 'Estado', enableSorting: true, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'code', header: 'Código', enableSorting: false, cell: ({ row }) => <span className="font-mono text-sm text-ink-3">{row.original.code}</span> },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Buscar citas" description="Todas las citas, con filtros. Toque una fila para ver el detalle, cancelarla o cambiarla de hora." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field id="citas-q" label="Buscar" className="lg:col-span-2" addon={<Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden />}>
          <Input value={q} onChange={(e) => (setQ(e.target.value), t.resetPage())} placeholder="Paciente, cédula, médico o C-000123" className="pl-11" />
        </Field>
        <Field id="citas-clinic" label="Clínica">
          <Select value={clinicId} onChange={(e) => (setClinicId(e.target.value), t.resetPage())}>
            <option value="">Todas</option>
            {clinics.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="citas-status" label="Estado">
          <Select value={status} onChange={(e) => (setStatus(e.target.value), t.resetPage())}>
            <option value="">Todos</option>
            {Object.entries(APPOINTMENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field id="citas-from" label="Desde">
            <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), t.resetPage())} />
          </Field>
          <Field id="citas-to" label="Hasta">
            <Input type="date" value={to} onChange={(e) => (setTo(e.target.value), t.resetPage())} />
          </Field>
        </div>
      </div>
      <DataTable
        caption="Citas"
        columns={columns}
        data={data.data?.items ?? []}
        total={data.data?.total ?? 0}
        pageCount={data.data?.pageCount ?? 1}
        pagination={t.pagination}
        onPaginationChange={t.setPagination}
        sorting={t.sorting}
        onSortingChange={t.setSorting}
        loading={data.isFetching}
        onRowClick={(a) => setOpenId(a.id)}
        empty={<EmptyState title="Sin citas con esos filtros">Amplíe el rango de fechas o quite filtros.</EmptyState>}
        renderCard={(a) => (
          <button type="button" onClick={() => setOpenId(a.id)} className="flex w-full flex-col gap-1 rounded-lg border border-rule bg-surface px-4 py-3 text-left">
            <span className="flex items-center justify-between gap-2">
              <span className="tabular font-mono font-medium">
                {shortDate(a.startsAt)} {time(a.startsAt)}
              </span>
              <StatusBadge status={a.status} />
            </span>
            <span className="font-bold">{a.patient.fullName}</span>
            <span className="text-sm text-ink-2">
              {a.doctor.fullName} · {a.clinic.name}
            </span>
          </button>
        )}
      />
      <AppointmentPanel id={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </>
  );
}
