'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, ChevronLeft, ChevronRight, FileDown, MapPin, PartyPopper } from 'lucide-react';
import { PORTAL_LIMITS, type PortalAppointment, type PortalSlot, type PublicDirectory } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { addDays, dayLabel, longDate, time, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Notice, Skeleton } from '@/components/ui/misc';
import landing from '@/components/landing/landing.module.css';
import { daysShort } from '@/components/landing/hours';
import { initials, toneClass } from '@/components/landing/tone';

type Clinic = PublicDirectory['clinics'][number];
type Doctor = PublicDirectory['doctors'][number];

/** Opción "Todas las clínicas": se buscan los médicos y horarios de las tres. */
const ALL = 'todas';

type Slot = PortalSlot & { clinicId: string; clinicName: string };

const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const WEEK_HEAD = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const monthName = (iso: string) => new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/** "2026-11-18" + 1 mes -> "2026-12-01" (primer día del mes). */
function monthStart(iso: string, plus = 0) {
  const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + plus);
  return d.toISOString().slice(0, 10);
}

/**
 * Agendar en una sola sección: arriba la clínica; abajo, lado a lado, el médico, el calendario del mes
 * y las horas libres con la confirmación. Solo se pueden tocar los días en que ese médico atiende en
 * esa clínica (sin cierres ni fechas fuera del límite del portal).
 */
export function BookingFlow({ directory }: { directory: PublicDirectory }) {
  const params = useSearchParams();
  const qc = useQueryClient();
  const [clinicId, setClinicId] = useState(ALL);
  const [specialty, setSpecialty] = useState('');
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [month, setMonth] = useState(0);
  const [done, setDone] = useState<PortalAppointment | null>(null);

  const clinic = directory.clinics.find((c) => c.id === clinicId) ?? null;
  const scope = clinicId === ALL ? directory.clinics : clinic ? [clinic] : [];
  const scopeIds = new Set(scope.map((c) => c.id));
  const here = directory.doctors.filter((d) => d.assignments.some((a) => scopeIds.has(a.clinicId)));
  const specialties = [...new Set(here.map((d) => d.specialty))].sort();
  const doctors = specialty ? here.filter((d) => d.specialty === specialty) : here;
  const doctor = here.find((d) => d.id === doctorId) ?? null;

  const pickClinic = (id: string) => {
    setClinicId(id);
    setSpecialty('');
    setDoctorId(null);
    setDate(null);
    setSlot(null);
  };
  const pickDoctor = (id: string) => {
    setDoctorId(id);
    setDate(null);
    setSlot(null);
    setMonth(0);
  };
  const pickDate = (d: string) => {
    setDate(d);
    setSlot(null);
  };

  // Días que se pueden tocar en el calendario, y en qué clínica(s) atiende el médico ese día.
  const bookable = useMemo(() => {
    const map = new Map<string, Clinic[]>();
    if (!doctor) return map;
    for (let i = 0; i <= PORTAL_LIMITS.maxDaysAhead; i++) {
      const d = addDays(todayIso(), i);
      const where = scope.filter((c) => !c.closures.some((x) => x.date === d) && doctor.assignments.some((a) => a.clinicId === c.id && a.weekday === weekdayOf(d)));
      if (where.length) map.set(d, where);
    }
    return map;
    // scope cambia con clinicId; se recalcula con él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor, clinicId, directory]);

  const dayClinics = date ? (bookable.get(date) ?? []) : [];
  const av = useQuery({
    queryKey: ['portal', 'availability', dayClinics.map((c) => c.id).join(','), date, doctorId],
    // Con "Todas las clínicas", se piden los horarios de cada clínica donde el médico atiende ese día.
    queryFn: async () => {
      const parts = await Promise.all(
        dayClinics.map(async (c) => {
          const r = await api<{ closed: string | null; slots: PortalSlot[] }>('/portal/availability', { query: { clinicId: c.id, date: date!, doctorId: doctorId! } });
          return { closed: r.closed, slots: r.slots.map((s) => ({ ...s, clinicId: c.id, clinicName: c.name })) };
        }),
      );
      const slots = parts.flatMap((p) => p.slots).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return { closed: slots.length ? null : (parts.find((p) => p.closed)?.closed ?? null), slots };
    },
    enabled: !!date && !!doctorId && dayClinics.length > 0,
  });
  const book = useMutation({
    mutationFn: () => api<PortalAppointment>('/portal/appointments', { method: 'POST', body: { clinicId: slot!.clinicId, doctorId, startsAt: slot!.startsAt, reason: reason || null } }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['portal'] });
      setDone(a);
    },
    onError: (e) => {
      // Si alguien tomó la hora mientras tanto, se actualizan los horarios libres.
      if (e instanceof ApiRequestError && e.status === 409) void av.refetch();
    },
  });

  if (done) return <Done appt={done} />;

  const today = todayIso();
  const first = monthStart(today, month);
  const lastAllowed = addDays(today, PORTAL_LIMITS.maxDaysAhead);
  const lead = (weekdayOf(first) + 6) % 7; // lunes primero
  const daysInMonth = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)).getUTCDate();
  const cells = [...Array<string | null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];

  return (
    <main className={cn(landing.gutter, 'pb-28 pt-5 lg:pb-6')}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        {params.get('nuevo') && (
          <Notice tone="good" title="¡Su cuenta está lista!">
            Ya puede agendar su primera cita.
          </Notice>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Agendar una cita</h1>
            <p className="flex items-center gap-2 text-ink-2">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {clinic ? `${clinic.name}${clinic.address ? `, ${clinic.address}` : ''}` : 'Las tres clínicas: elija médico y día, y le mostramos dónde atiende.'}
            </p>
          </div>
          <div role="radiogroup" aria-label="Clínica" className="flex flex-wrap gap-1 rounded-lg border border-rule bg-surface p-1.5">
            <button
              type="button"
              role="radio"
              aria-checked={clinicId === ALL}
              onClick={() => pickClinic(ALL)}
              className={cn('flex min-h-11 items-center gap-2 rounded-md px-4 font-bold', clinicId === ALL ? 'bg-ballpoint text-ballpoint-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
            >
              Todas
            </button>
            {directory.clinics.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === clinicId}
                onClick={() => pickClinic(c.id)}
                className={cn('flex min-h-11 items-center gap-2 rounded-md px-4 font-bold', c.id === clinicId ? 'bg-ballpoint text-ballpoint-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
              >
                <span className={cn(landing.dot, toneClass(c.name), c.id === clinicId && 'ring-2 ring-ballpoint-ink')} aria-hidden />
                {c.name.replace('Clínica ', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Una sola sección: médico | calendario | hora */}
        <section className="grid overflow-hidden rounded-lg border border-rule bg-surface lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,19rem)]" aria-label="Elegir médico, día y hora">
          {/* 1. Médico */}
          <div className="flex min-w-0 flex-col border-b border-rule lg:border-b-0 lg:border-r">
            <ColumnHead title="1. Médico" note={`${doctors.length} en ${clinic ? clinic.name.replace('Clínica ', '') : 'las tres clínicas'}`} />
            <div className="flex min-w-0 flex-col gap-2 p-3">
              {specialties.length > 1 && (
                <Select aria-label="Especialidad" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                  <option value="">Todas las especialidades</option>
                  {specialties.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              )}
              <ul className="flex max-h-[19rem] flex-col gap-1 overflow-y-auto">
                {doctors.map((d) => {
                  const selected = d.id === doctorId;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => pickDoctor(d.id)}
                        className={cn('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left', selected ? 'bg-ballpoint text-ballpoint-ink' : 'hover:bg-surface-2')}
                      >
                        <span
                          className={cn('grid size-10 shrink-0 place-items-center rounded-full font-bold', selected ? 'bg-ballpoint-ink/20 text-ballpoint-ink' : 'bg-ballpoint-soft text-ballpoint')}
                          aria-hidden
                        >
                          {initials(d.fullName)}
                        </span>
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate font-bold">{d.fullName}</span>
                          <span className={cn('truncate text-sm', selected ? 'opacity-90' : 'text-ink-2')}>{d.specialty}</span>
                          <span className={cn('text-xs', selected ? 'opacity-80' : 'text-ink-3')}>{whereAndWhen(d, scope)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* 2. Calendario del mes */}
          <div className="flex min-w-0 flex-col border-b border-rule lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2 border-b border-rule bg-surface-2 px-4 py-1.5">
              <h2 className="whitespace-nowrap font-bold">2. Día</h2>
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="icon" className="size-9" aria-label="Mes anterior" disabled={month === 0} onClick={() => setMonth((m) => m - 1)}>
                  <ChevronLeft />
                </Button>
                <span className="whitespace-nowrap text-center text-sm font-bold first-letter:uppercase sm:min-w-36 sm:text-base">{monthName(first)}</span>
                <Button variant="secondary" size="icon" className="size-9" aria-label="Mes siguiente" disabled={monthStart(today, month + 1) > lastAllowed} onClick={() => setMonth((m) => m + 1)}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-3">
              <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`Calendario de ${monthName(first)}`}>
                {WEEK_HEAD.map((w) => (
                  <span key={w} className="py-1 text-xs font-bold text-ink-3" role="columnheader">
                    {w}
                  </span>
                ))}
                {cells.map((d, i) =>
                  d === null ? (
                    <span key={`b${i}`} />
                  ) : (
                    <button
                      key={d}
                      type="button"
                      role="gridcell"
                      disabled={!bookable.has(d)}
                      aria-selected={d === date}
                      aria-label={dayLabel(d)}
                      onClick={() => pickDate(d)}
                      className={cn(
                        'tabular flex h-10 w-full items-center justify-center rounded-md text-sm sm:text-base',
                        d === date
                          ? 'bg-ballpoint font-bold text-ballpoint-ink'
                          : bookable.has(d)
                            ? 'border-2 border-dashed border-rule font-bold text-ink hover:border-ballpoint hover:bg-ballpoint-soft hover:text-ballpoint'
                            : 'bg-[repeating-linear-gradient(135deg,var(--surface-2)_0,var(--surface-2)_5px,transparent_5px,transparent_10px)] text-ink-3',
                        d === today && d !== date && 'ring-2 ring-ballpoint ring-offset-1 ring-offset-surface',
                      )}
                    >
                      {Number(d.slice(8, 10))}
                    </button>
                  ),
                )}
              </div>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-3">
                {doctor ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-3 rounded-sm border-2 border-dashed border-rule-strong" aria-hidden /> Atiende ese día
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-3 rounded-sm bg-[repeating-linear-gradient(135deg,var(--rule-strong)_0,var(--rule-strong)_2px,transparent_2px,transparent_4px)]" aria-hidden />{' '}
                      No atiende
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-3 rounded-sm ring-2 ring-ballpoint" aria-hidden /> Hoy
                    </span>
                  </>
                ) : (
                  'Elija un médico para ver sus días de atención.'
                )}
              </p>
            </div>
          </div>

          {/* 3. Hora y confirmación */}
          <div className="flex min-w-0 flex-col">
            <ColumnHead title="3. Hora" note={date ? dayLabel(date) : undefined} />
            <div className="flex min-w-0 flex-col gap-3 p-3">
              {!date ? (
                <p className="text-ink-3">{doctor ? 'Toque un día en el calendario.' : 'Primero elija médico y día.'}</p>
              ) : av.isPending ? (
                <Skeleton className="h-32" />
              ) : av.isError ? (
                <Notice tone="danger">{errorMessage(av.error)}</Notice>
              ) : av.data.closed ? (
                <Notice tone="warn">{av.data.closed}</Notice>
              ) : !av.data.slots.length ? (
                <Notice tone="info">No quedan horas libres ese día. Elija otro (en línea se agenda con {PORTAL_LIMITS.minHoursAhead} horas de anticipación).</Notice>
              ) : (
                <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                  {dayClinics.map((c) => {
                    const list = av.data.slots.filter((s) => s.clinicId === c.id);
                    if (!list.length) return null;
                    return (
                      <div key={c.id} className="flex flex-col gap-1.5">
                        {dayClinics.length > 1 || clinicId === ALL ? (
                          <p className="flex items-center gap-1.5 text-sm font-bold text-ink-2">
                            <span className={cn(landing.dot, toneClass(c.name))} aria-hidden /> {c.name}
                          </p>
                        ) : null}
                        <div className="grid grid-cols-3 gap-1.5">
                          {list.map((s) => (
                            <button
                              key={s.startsAt}
                              type="button"
                              aria-pressed={slot?.startsAt === s.startsAt}
                              onClick={() => setSlot(s)}
                              className={cn(
                                'tabular min-h-10 rounded-md font-bold',
                                slot?.startsAt === s.startsAt
                                  ? 'bg-ballpoint text-ballpoint-ink'
                                  : 'border-2 border-dashed border-rule text-ink hover:border-ballpoint hover:bg-ballpoint-soft hover:text-ballpoint',
                              )}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {slot && doctor && date && (
                <div className="flex flex-col gap-2 border-t border-rule pt-3">
                  <p className="text-sm">
                    <strong className="first-letter:uppercase">{dayLabel(date)}</strong>, a las <strong>{slot.label}</strong>, con <strong>{doctor.fullName}</strong>, en{' '}
                    <strong>{slot.clinicName}</strong>.
                  </p>
                  <Input aria-label="Motivo de la consulta (opcional)" placeholder="Motivo (opcional)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
                  {book.isError && <Notice tone="danger">{errorMessage(book.error)}</Notice>}
                  <Button size="lg" disabled={book.isPending} onClick={() => book.mutate()}>
                    <CalendarCheck /> {book.isPending ? 'Enviando…' : 'Solicitar cita'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/** "Centro: lun y mié · Norte: mar" (con todas las clínicas) o "lun, mié y vie" (con una). */
function whereAndWhen(d: Doctor, scope: Clinic[]) {
  const parts = scope.map((c) => ({ c, days: d.assignments.filter((a) => a.clinicId === c.id).map((a) => a.weekday) })).filter((x) => x.days.length);
  if (parts.length === 1 && scope.length === 1) return daysShort(parts[0].days);
  return parts.map((x) => `${x.c.name.replace('Clínica ', '')}: ${daysShort(x.days)}`).join(' · ');
}

/** Encabezado de columna con el mismo aspecto que los de la cuadrícula de la agenda del personal. */
function ColumnHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex min-h-12 items-baseline justify-between gap-2 border-b border-rule bg-surface-2 px-4 py-2.5">
      <h2 className="whitespace-nowrap font-bold">{title}</h2>
      {note && <span className="truncate text-sm text-ink-3 first-letter:uppercase">{note}</span>}
    </div>
  );
}

function Done({ appt: a }: { appt: PortalAppointment }) {
  return (
    <main className={cn(landing.gutter, 'pb-28 pt-12')}>
      <div className={cn(toneClass(a.clinic.name), 'mx-auto flex max-w-2xl flex-col gap-6 overflow-hidden rounded-2xl border-2 border-[var(--tone)] bg-surface')}>
        <div className="flex flex-col gap-2 bg-[var(--tone)] p-6 text-[var(--tone-ink)]">
          <PartyPopper className="size-10" aria-hidden />
          <h1 className="font-display text-4xl font-extrabold">¡Solicitud enviada!</h1>
          <p className="text-lg first-letter:uppercase">
            {longDate(a.startsAt)}, a las {time(a.startsAt)}
          </p>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <p className="text-lg">
            Con <strong>{a.doctorName}</strong> ({a.specialty.toLowerCase()}) en <strong>{a.clinic.name}</strong>
            {a.clinic.address && `, ${a.clinic.address}`}.
          </p>
          <p className="text-ink-2">
            Ese horario ya quedó reservado para usted. La clínica revisará su solicitud y la confirmará; verá el estado en “Mis citas” (de “Por confirmar” a “Agendada”). Código: {a.code}.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="rounded-full" asChild>
              <Link href="/paciente">Ver mis citas</Link>
            </Button>
            <Button variant="secondary" size="lg" className="rounded-full" asChild>
              <a href={`/api/portal/appointments/${a.id}/comprobante.pdf`} download={`comprobante-${a.code}.pdf`}>
                <FileDown /> Descargar comprobante (PDF)
              </a>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
