'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarPlus, ChevronLeft, ChevronRight, CloudUpload, Plus, Trash2 } from 'lucide-react';
import type { AppointmentView, AvailabilitySlot } from '@clinagenda/schemas';
import { addDays, dayLabel, phone, time, todayIso } from '@/lib/format';
import { useAppointments, useAvailability, useClinics } from '@/lib/queries';
import { discard, listPending, onQueueChange, type PendingAppointment } from '@/lib/offline-queue';
import { useCan, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { BookingWizard, type BookingPreset } from '@/components/appointments/booking-wizard';
import { AppointmentPanel } from '@/components/appointments/appointment-panel';
import { StatusBadge } from '@/components/appointments/status-badge';

export default function AgendaPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Agenda />
    </Suspense>
  );
}

type Row = { kind: 'free'; slot: AvailabilitySlot } | { kind: 'appt'; appt: AppointmentView };

function Agenda() {
  const user = useSession();
  const canBook = useCan('ADMIN', 'RECEPCION', 'MEDICO');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const clinics = useClinics();

  const date = params.get('fecha') ?? todayIso();
  const clinicId = params.get('clinica') ?? user.clinicId ?? clinics.data?.[0]?.id;
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    router.replace(`${pathname}?${p}`, { scroll: false });
  };

  const appts = useAppointments({ from: date, to: date, clinicId, pageSize: 500, sortBy: 'startsAt' }, !!clinicId);
  const av = useAvailability(clinicId, date);
  const [wizard, setWizard] = useState<BookingPreset | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAppointment[]>([]);

  useEffect(() => {
    const load = () => void listPending().then(setPending);
    load();
    return onQueueChange(load);
  }, []);

  const clinic = clinics.data?.find((c) => c.id === clinicId);
  const isPastDay = date < todayIso();

  // Una columna por médico: horarios libres + citas, en orden de hora.
  const columns = useMemo(() => {
    const items = appts.data?.items ?? [];
    const active = items.filter((a) => a.status !== 'CANCELLED');
    const docs = new Map<string, { name: string; rows: Row[] }>();
    for (const s of av.data?.slots ?? []) {
      if (!docs.has(s.doctorId)) docs.set(s.doctorId, { name: s.doctorName, rows: [] });
      if (s.available) docs.get(s.doctorId)!.rows.push({ kind: 'free', slot: s });
    }
    for (const a of active) {
      if (!docs.has(a.doctor.id)) docs.set(a.doctor.id, { name: a.doctor.fullName, rows: [] });
      docs.get(a.doctor.id)!.rows.push({ kind: 'appt', appt: a });
    }
    for (const d of docs.values()) d.rows.sort((x, y) => (x.kind === 'free' ? x.slot.startsAt : x.appt.startsAt).localeCompare(y.kind === 'free' ? y.slot.startsAt : y.appt.startsAt));
    const visible = [...docs.entries()].filter(([id]) => user.role !== 'MEDICO' || id === user.doctorId);
    return { visible, cancelled: items.filter((a) => a.status === 'CANCELLED') };
  }, [appts.data, av.data, user]);

  const pendingToday = pending.filter((p) => p.input.clinicId === clinicId && p.input.startsAt.slice(0, 10) === date);
  const total = appts.data?.items.filter((a) => a.status !== 'CANCELLED').length ?? 0;

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold uppercase tracking-wider text-ink-3">{clinic?.name ?? 'Agenda'}</p>
            <h1 className="text-3xl font-extrabold capitalize">
              {date === todayIso() ? 'Hoy, ' : ''}
              {dayLabel(date)}
            </h1>
            <p className="tabular text-ink-2">{appts.isPending ? 'Cargando…' : `${total} cita${total === 1 ? '' : 's'} agendada${total === 1 ? '' : 's'}`}</p>
          </div>
          {canBook && (
            <Button size="lg" onClick={() => setWizard({ clinicId, date: isPastDay ? todayIso() : date })}>
              <CalendarPlus /> Nueva cita
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" aria-label="Día anterior" onClick={() => setParam('fecha', addDays(date, -1))}>
              <ChevronLeft />
            </Button>
            <Input type="date" aria-label="Elegir día" className="w-auto" value={date} onChange={(e) => e.target.value && setParam('fecha', e.target.value)} />
            <Button variant="secondary" size="icon" aria-label="Día siguiente" onClick={() => setParam('fecha', addDays(date, 1))}>
              <ChevronRight />
            </Button>
            {date !== todayIso() && (
              <Button variant="ghost" onClick={() => setParam('fecha', todayIso())}>
                Hoy
              </Button>
            )}
          </div>
          <div role="tablist" aria-label="Clínica" className="flex flex-wrap gap-1 rounded-md bg-surface-2 p-1">
            {clinics.data?.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === clinicId}
                onClick={() => setParam('clinica', c.id)}
                className={cn('min-h-10 rounded-sm px-4 font-bold', c.id === clinicId ? 'bg-surface text-ballpoint shadow-sm' : 'text-ink-2 hover:text-ink')}
              >
                {c.name.replace('Clínica ', '')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pendingToday.length > 0 && (
        <Notice tone="warn" title="Citas guardadas en este equipo, sin confirmar">
          <ul className="mt-2 flex flex-col gap-2">
            {pendingToday.map((p) => (
              <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-dashed border-warn/60 bg-surface px-3 py-2">
                <span>
                  <CloudUpload className="mr-2 inline size-5 text-warn" aria-hidden />
                  {p.summary}
                  {p.status === 'CONFLICT' && <span className="block text-sm font-bold text-redpen">{p.error}</span>}
                </span>
                {p.status === 'CONFLICT' && (
                  <Button variant="secondary" size="sm" onClick={() => void discard(p.key)}>
                    <Trash2 /> Descartar (avisar al paciente)
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {av.data?.closed ? (
        <EmptyState title="Este día no se atiende">{av.data.closed}</EmptyState>
      ) : appts.isPending || av.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : appts.isError ? (
        <Notice tone="warn" title="No se pudo cargar la agenda">
          Revise la conexión. Si está sin internet, se muestra la última agenda guardada en este equipo cuando exista.
        </Notice>
      ) : columns.visible.length === 0 ? (
        <EmptyState title="No hay médicos este día">Elija otro día u otra clínica.</EmptyState>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns.visible.map(([doctorId, d]) => (
            <section key={doctorId} className="flex min-w-0 flex-col rounded-lg border border-rule bg-surface" aria-label={d.name}>
              <header className="flex items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
                <h2 className="text-lg font-bold">{d.name}</h2>
                <span className="tabular text-sm text-ink-3">{d.rows.filter((r) => r.kind === 'appt').length} citas</span>
              </header>
              <ol className="ruled flex flex-col">
                {d.rows.length === 0 && <li className="px-4 py-6 text-ink-3">Sin horarios libres ni citas.</li>}
                {d.rows.map((r) =>
                  r.kind === 'free' ? (
                    <li key={`f-${r.slot.startsAt}`} className="flex min-h-14 items-center gap-3 border-b border-rule/70 px-4">
                      <span className="w-14 font-mono text-ink-3">{r.slot.label}</span>
                      {canBook ? (
                        <button
                          type="button"
                          onClick={() => setWizard({ clinicId, date, slot: r.slot })}
                          className="flex min-h-11 flex-1 items-center gap-2 rounded-md px-2 text-left text-ink-3 hover:bg-ballpoint-soft hover:text-ballpoint"
                        >
                          <Plus className="size-5" aria-hidden /> Libre — agendar aquí
                        </button>
                      ) : (
                        <span className="text-ink-3">Libre</span>
                      )}
                    </li>
                  ) : (
                    <li key={r.appt.id} className="border-b border-rule/70">
                      <button type="button" onClick={() => setOpenId(r.appt.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2">
                        <span className="w-14 pt-0.5 font-mono font-medium">{time(r.appt.startsAt)}</span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate font-bold">{r.appt.patient.fullName}</span>
                          <span className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                            <StatusBadge status={r.appt.status} />
                            <span className="font-mono">{phone(r.appt.patient.phone)}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ),
                )}
              </ol>
            </section>
          ))}
        </div>
      )}

      {columns.cancelled.length > 0 && (
        <details className="rounded-lg border border-rule bg-surface px-4 py-3">
          <summary className="cursor-pointer font-bold">Canceladas este día ({columns.cancelled.length}) — se pueden reactivar</summary>
          <ul className="mt-3 flex flex-col gap-1">
            {columns.cancelled.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => setOpenId(a.id)} className="flex w-full flex-wrap items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2">
                  <span className="font-mono text-ink-3 line-through decoration-redpen">{time(a.startsAt)}</span>
                  <span className="font-bold">{a.patient.fullName}</span>
                  <span className="text-ink-2">{a.doctor.fullName}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <BookingWizard open={!!wizard} onOpenChange={(o) => !o && setWizard(null)} preset={wizard ?? undefined} />
      <AppointmentPanel id={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </>
  );
}
