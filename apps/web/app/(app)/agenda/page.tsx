'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarCheck, CalendarClock, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, CloudUpload, Plus, Sparkles, Trash2, UserX } from 'lucide-react';
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus, type AppointmentView, type AvailabilitySlot } from '@clinagenda/schemas';
import { addDays, dayLabel, phone, time, todayIso } from '@/lib/format';
import { useAppointments, useAvailability, useClinics } from '@/lib/queries';
import { discard, listPending, onQueueChange, type PendingAppointment } from '@/lib/offline-queue';
import { useCan, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { Stat, StatGrid } from '@/components/ui/stat';
import { BookingWizard, type BookingPreset } from '@/components/appointments/booking-wizard';
import { AppointmentPanel } from '@/components/appointments/appointment-panel';
import landing from '@/components/landing/landing.module.css';
import { toneClass } from '@/components/landing/tone';

export default function AgendaPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Agenda />
    </Suspense>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lo que hay en una celda de la cuadrícula (un médico a una hora). */
type Cell = { kind: 'appt'; appt: AppointmentView } | { kind: 'free'; slot: AvailabilitySlot } | { kind: 'busy' } | { kind: 'off' };

interface Grid {
  times: string[];
  doctors: { id: string; name: string; count: number }[];
  cell: (doctorId: string, t: string) => Cell;
}

/** Ícono por estado: con el nombre del estado para lectores de pantalla y al pasar el mouse. */
function StatusIcon({ status }: { status: AppointmentStatus }) {
  const Icon = status === 'ATTENDED' ? CheckCircle2 : status === 'NO_SHOW' ? UserX : CalendarClock;
  const color = status === 'ATTENDED' ? 'text-good' : status === 'NO_SHOW' ? 'text-warn' : 'text-ballpoint';
  return (
    <>
      <Icon className={cn('size-4 shrink-0', color)} aria-hidden />
      <span className="sr-only">{APPOINTMENT_STATUS_LABELS[status]}:</span>
    </>
  );
}

/** Borde de color por estado: se distingue también por el texto y el ícono, nunca solo por el color. */
const STATUS_BORDER: Record<AppointmentStatus, string> = {
  SCHEDULED: 'border-l-ballpoint bg-ballpoint-soft/50',
  ATTENDED: 'border-l-good bg-good-soft/60',
  NO_SHOW: 'border-l-warn bg-warn-soft/60',
  CANCELLED: 'border-l-redpen',
};

function Agenda() {
  const user = useSession();
  const canBook = useCan('citas.agendar');
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
  const [doctorFilter, setDoctorFilter] = useState<string>('');
  const [mobileDoctor, setMobileDoctor] = useState<string>('');

  useEffect(() => {
    const load = () => void listPending().then(setPending);
    load();
    return onQueueChange(load);
  }, []);
  // Al cambiar de día o de clínica, el filtro de médico deja de tener sentido.
  useEffect(() => setDoctorFilter(''), [date, clinicId]);

  const clinic = clinics.data?.find((c) => c.id === clinicId);
  const isToday = date === todayIso();
  const isPastDay = date < todayIso();
  const { active, cancelled } = useMemo(() => {
    const items = appts.data?.items ?? [];
    return { active: items.filter((a) => a.status !== 'CANCELLED'), cancelled: items.filter((a) => a.status === 'CANCELLED') };
  }, [appts.data]);

  // Filas = horas del día; columnas = médicos. Cada cita y cada turno libre cae en su celda.
  const grid: Grid = useMemo(() => {
    const slots = av.data?.slots ?? [];
    const names = new Map<string, string>();
    for (const s of slots) names.set(s.doctorId, s.doctorName);
    for (const a of active) names.set(a.doctor.id, a.doctor.fullName);
    const slotAt = new Map(slots.map((s) => [`${s.doctorId}|${s.label}`, s]));
    const apptAt = new Map(active.map((a) => [`${a.doctor.id}|${time(a.startsAt)}`, a]));
    const times = [...new Set([...slots.map((s) => s.label), ...active.map((a) => time(a.startsAt))])].sort();
    const doctors = [...names.entries()]
      .filter(([id]) => user.role !== 'MEDICO' || id === user.doctorId)
      .map(([id, name]) => ({ id, name, count: active.filter((a) => a.doctor.id === id).length }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      times,
      doctors,
      cell: (doctorId, t) => {
        const appt = apptAt.get(`${doctorId}|${t}`);
        if (appt) return { kind: 'appt', appt };
        const slot = slotAt.get(`${doctorId}|${t}`);
        if (!slot) return { kind: 'off' };
        return slot.available ? { kind: 'free', slot } : { kind: 'busy' };
      },
    };
  }, [av.data, active, user]);

  const shown = doctorFilter ? grid.doctors.filter((d) => d.id === doctorFilter) : grid.doctors;
  const mobile = grid.doctors.find((d) => d.id === mobileDoctor) ?? grid.doctors[0];
  const freeCount = (av.data?.slots ?? []).filter((s) => s.available && grid.doctors.some((d) => d.id === s.doctorId)).length;
  const nowLabel = isToday ? time(new Date()) : null;
  // Fila "actual": la última hora que ya empezó.
  const currentTime = nowLabel ? [...grid.times].reverse().find((t) => t <= nowLabel) : undefined;
  const pendingToday = pending.filter((p) => !p.input || (p.input.clinicId === clinicId && p.input.startsAt.slice(0, 10) === date));

  const renderCell = (doctorId: string, t: string) => {
    const c = grid.cell(doctorId, t);
    if (c.kind === 'appt') {
      const a = c.appt;
      return (
        <button
          type="button"
          onClick={() => setOpenId(a.id)}
          title={`${a.patient.fullName} · ${APPOINTMENT_STATUS_LABELS[a.status]}${a.patient.phone ? ' · ' + phone(a.patient.phone) : ''}`}
          className={cn('flex h-full w-full min-w-0 items-center gap-1.5 rounded-sm border-l-4 px-2 text-left text-sm hover:brightness-95', STATUS_BORDER[a.status])}
        >
          <StatusIcon status={a.status} />
          <span className="min-w-0 flex-1 truncate font-bold">{a.patient.fullName}</span>
        </button>
      );
    }
    if (c.kind === 'free') {
      return canBook ? (
        <button
          type="button"
          onClick={() => setWizard({ clinicId, date, slot: c.slot })}
          className="group flex h-full w-full items-center gap-1 rounded-sm border border-dashed border-rule px-2 text-ink-3 hover:border-ballpoint hover:bg-ballpoint-soft hover:text-ballpoint"
          aria-label={`Agendar con ${grid.doctors.find((d) => d.id === doctorId)?.name} a las ${t}`}
        >
          <Plus className="size-3.5" aria-hidden /> <span className="text-xs">Libre</span>
        </button>
      ) : (
        <span className="flex h-full items-center px-2 text-xs text-ink-3">Libre</span>
      );
    }
    if (c.kind === 'busy') return <span className="flex h-full items-center px-2 text-xs text-ink-3">{nowLabel && t < nowLabel ? 'Ya pasó' : 'No disponible'}</span>;
    return <span className="block h-full rounded-sm bg-[repeating-linear-gradient(135deg,var(--surface-2)_0,var(--surface-2)_5px,transparent_5px,transparent_10px)]" aria-label="No atiende" />;
  };

  return (
    <>
      {/* Encabezado: día, navegación, clínica y la acción principal */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-3xl font-extrabold first-letter:uppercase sm:text-4xl">
              {isToday ? 'Hoy, ' : ''}
              {dayLabel(date)}
            </h1>
            <p className="text-ink-2">
              {clinic?.name ?? 'Agenda'}
              {clinic && ` · turnos de ${clinic.slotMinutes} minutos`}
            </p>
          </div>
          {canBook && (
            <Button size="lg" onClick={() => setWizard({ clinicId, date: isPastDay ? todayIso() : date })}>
              <CalendarPlus /> Nueva cita
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-surface p-2">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" aria-label="Día anterior" onClick={() => setParam('fecha', addDays(date, -1))}>
              <ChevronLeft />
            </Button>
            <Input type="date" aria-label="Elegir día" className="w-auto" value={date} onChange={(e) => e.target.value && setParam('fecha', e.target.value)} />
            <Button variant="secondary" size="icon" aria-label="Día siguiente" onClick={() => setParam('fecha', addDays(date, 1))}>
              <ChevronRight />
            </Button>
            {!isToday && (
              <Button variant="ghost" onClick={() => setParam('fecha', todayIso())}>
                Hoy
              </Button>
            )}
          </div>
          <div role="tablist" aria-label="Clínica" className="flex flex-wrap gap-1">
            {clinics.data?.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === clinicId}
                onClick={() => setParam('clinica', c.id)}
                className={cn('flex min-h-11 items-center gap-2 rounded-md px-4 font-bold', c.id === clinicId ? 'bg-ballpoint text-ballpoint-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
              >
                <span className={cn(landing.dot, toneClass(c.name), c.id === clinicId && 'ring-2 ring-ballpoint-ink')} aria-hidden />
                {c.name.replace('Clínica ', '')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pendingToday.length > 0 && (
        <Notice tone="warn" title="Cambios guardados en este equipo, todavía sin enviar">
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

      {/* Resumen del día */}
      <StatGrid>
        <Stat label="Citas del día" value={appts.isPending ? '…' : active.length} icon={CalendarClock} tone="info" note={plural(grid.doctors.length, 'médico atiende', 'médicos atienden')} />
        <Stat label="Atendidas" value={appts.isPending ? '…' : active.filter((a) => a.status === 'ATTENDED').length} icon={CalendarCheck} tone="good" note="Ya pasaron por consulta" />
        <Stat
          label="Por atender"
          value={appts.isPending ? '…' : active.filter((a) => a.status === 'SCHEDULED').length}
          icon={UserX}
          tone="warn"
          note={`${active.filter((a) => a.status === 'NO_SHOW').length} no asistieron`}
        />
        <Stat label="Horarios libres" value={av.isPending ? '…' : freeCount} icon={Sparkles} tone="neutral" note={freeCount ? 'Para dar citas hoy' : 'Agenda llena'} />
      </StatGrid>

      {av.data?.closed ? (
        <EmptyState title="Este día no se atiende">{av.data.closed}</EmptyState>
      ) : appts.isPending || av.isPending ? (
        <Skeleton className="h-96" />
      ) : appts.isError ? (
        <Notice tone="warn" title="No se pudo cargar la agenda">
          Revise la conexión. Si está sin internet, se muestra la última agenda guardada en este equipo cuando exista.
        </Notice>
      ) : grid.doctors.length === 0 ? (
        <EmptyState title="No hay médicos este día">Elija otro día u otra clínica.</EmptyState>
      ) : (
        <>
          {/* Computadora y tableta: cuadrícula horas × médicos */}
          <section className="hidden flex-col gap-3 md:flex" aria-label="Agenda por médico y hora">
            {grid.doctors.length > 1 && (
              <div role="radiogroup" aria-label="Mostrar médico" className="flex flex-wrap gap-2">
                {[{ id: '', name: 'Todos', count: active.length }, ...grid.doctors].map((d) => (
                  <button
                    key={d.id || 'all'}
                    type="button"
                    role="radio"
                    aria-checked={doctorFilter === d.id}
                    onClick={() => setDoctorFilter(d.id)}
                    className={cn(
                      'flex min-h-10 items-center gap-2 rounded-full border-2 px-4 text-sm font-bold',
                      doctorFilter === d.id ? 'border-ballpoint bg-ballpoint text-ballpoint-ink' : 'border-rule-strong text-ink-2 hover:border-ballpoint hover:text-ink',
                    )}
                  >
                    {d.name}
                    <span className={cn('tabular rounded-full px-1.5 text-xs', doctorFilter === d.id ? 'bg-ballpoint-ink/20' : 'bg-surface-2')}>{d.count}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-[calc(100dvh-12rem)] overflow-auto rounded-lg border border-rule bg-surface">
              <div className="grid min-w-full" style={{ gridTemplateColumns: `3.75rem repeat(${shown.length}, minmax(10rem, 1fr))` }}>
                <div className="sticky left-0 top-0 z-20 border-b border-r border-rule bg-surface-2" />
                {shown.map((d) => (
                  <div key={d.id} className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-rule bg-surface-2 px-2.5 py-2 text-sm">
                    <span className="truncate font-bold">{d.name}</span>
                    <span className="tabular shrink-0 text-sm text-ink-3">{plural(d.count, 'cita', 'citas')}</span>
                  </div>
                ))}
                {grid.times.map((t) => {
                  const now = t === currentTime;
                  return (
                    <div key={t} className="contents">
                      <div
                        className={cn(
                          'tabular sticky left-0 z-10 flex h-10 items-center justify-end border-b border-r border-rule px-2 text-xs',
                          now ? 'bg-ballpoint font-bold text-ballpoint-ink' : 'bg-surface text-ink-2',
                        )}
                      >
                        {t}
                      </div>
                      {shown.map((d) => (
                        <div key={d.id} className={cn('h-10 border-b border-rule p-0.5', now && 'bg-ballpoint-soft/30')}>
                          {renderCell(d.id, t)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-3">
              <span className="flex items-center gap-1.5">
                <StatusIcon status="SCHEDULED" /> Agendada
              </span>
              <span className="flex items-center gap-1.5">
                <StatusIcon status="ATTENDED" /> Atendida
              </span>
              <span className="flex items-center gap-1.5">
                <StatusIcon status="NO_SHOW" /> No asistió
              </span>
              <span>Toque una cita para ver el teléfono, el estado y cambiarla.</span>
              {canBook && <span>Toque “Libre” para agendar ahí.</span>}
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[repeating-linear-gradient(135deg,var(--rule-strong)_0,var(--rule-strong)_2px,transparent_2px,transparent_4px)]" aria-hidden />
                El médico no atiende a esa hora
              </span>
            </p>
          </section>

          {/* Celular: un médico a la vez, como lista de horas */}
          <section className="flex flex-col gap-3 md:hidden" aria-label="Agenda del médico elegido">
            <Select aria-label="Médico" value={mobile?.id ?? ''} onChange={(e) => setMobileDoctor(e.target.value)}>
              {grid.doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({plural(d.count, 'cita', 'citas')})
                </option>
              ))}
            </Select>
            {mobile && (
              <ol className="flex flex-col overflow-hidden rounded-lg border border-rule bg-surface">
                {grid.times
                  .filter((t) => grid.cell(mobile.id, t).kind !== 'off')
                  .map((t) => (
                    <li key={t} className={cn('flex items-center gap-2 border-b border-rule p-0.5 last:border-0', t === currentTime && 'bg-ballpoint-soft/40')}>
                      <span className={cn('tabular w-12 shrink-0 text-right text-xs', t === currentTime ? 'font-bold text-ballpoint' : 'text-ink-2')}>{t}</span>
                      <div className="h-10 min-w-0 flex-1">{renderCell(mobile.id, t)}</div>
                    </li>
                  ))}
              </ol>
            )}
          </section>
        </>
      )}

      {cancelled.length > 0 && (
        <details className="rounded-lg border border-rule bg-surface px-4 py-3">
          <summary className="cursor-pointer font-bold">Canceladas este día ({cancelled.length}): se pueden reactivar</summary>
          <ul className="mt-3 flex flex-col gap-1">
            {cancelled.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => setOpenId(a.id)} className="flex w-full flex-wrap items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2">
                  <span className="tabular text-ink-3 line-through decoration-redpen">{time(a.startsAt)}</span>
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
