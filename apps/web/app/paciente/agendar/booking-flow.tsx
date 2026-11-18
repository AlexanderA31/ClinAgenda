'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, ChevronLeft, ChevronRight, ExternalLink, MapPin, PartyPopper } from 'lucide-react';
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
  const [clinicId, setClinicId] = useState(directory.clinics[0]?.id ?? '');
  const [specialty, setSpecialty] = useState('');
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<PortalSlot | null>(null);
  const [reason, setReason] = useState('');
  const [month, setMonth] = useState(0);
  const [done, setDone] = useState<PortalAppointment | null>(null);

  const clinic = directory.clinics.find((c) => c.id === clinicId) ?? null;
  const here = directory.doctors.filter((d) => d.assignments.some((a) => a.clinicId === clinicId));
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

  // Días que se pueden tocar en el calendario.
  const bookable = useMemo(() => {
    const set = new Set<string>();
    if (!doctor || !clinic) return set;
    const weekdays = new Set(doctor.assignments.filter((a) => a.clinicId === clinic.id).map((a) => a.weekday));
    const closed = new Set(clinic.closures.map((c) => c.date));
    for (let i = 0; i <= PORTAL_LIMITS.maxDaysAhead; i++) {
      const d = addDays(todayIso(), i);
      if (weekdays.has(weekdayOf(d)) && !closed.has(d)) set.add(d);
    }
    return set;
  }, [doctor, clinic]);

  const av = useQuery({
    queryKey: ['portal', 'availability', clinicId, date, doctorId],
    queryFn: () => api<{ closed: string | null; slots: PortalSlot[] }>('/portal/availability', { query: { clinicId, date: date!, doctorId: doctorId! } }),
    enabled: !!date && !!doctorId,
  });
  const book = useMutation({
    mutationFn: () => api<PortalAppointment>('/portal/appointments', { method: 'POST', body: { clinicId, doctorId, startsAt: slot!.startsAt, reason: reason || null } }),
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
            {clinic?.address && (
              <p className="flex items-center gap-2 text-ink-2">
                <MapPin className="size-4 shrink-0" aria-hidden /> {clinic.name}, {clinic.address}
              </p>
            )}
          </div>
          <div role="radiogroup" aria-label="Clínica" className="flex flex-wrap gap-2">
            {directory.clinics.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === clinicId}
                onClick={() => pickClinic(c.id)}
                className={cn(
                  toneClass(c.name),
                  'flex min-h-11 items-center gap-2 rounded-full border-2 px-4 font-bold',
                  c.id === clinicId ? 'border-[var(--tone)] bg-[var(--tone)] text-[var(--tone-ink)]' : 'border-rule-strong text-ink-2 hover:border-[var(--tone)]',
                )}
              >
                <span className={cn(landing.dot, c.id === clinicId && 'ring-2 ring-[var(--tone-ink)]')} aria-hidden />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Una sola sección: médico | calendario | hora */}
        <section
          className={cn(
            clinic && toneClass(clinic.name),
            'grid overflow-hidden rounded-2xl border-2 border-[var(--tone,var(--rule))] bg-surface lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,19rem)]',
          )}
          aria-label="Elegir médico, día y hora"
        >
          {/* 1. Médico */}
          <div className="flex min-w-0 flex-col gap-3 border-b border-rule p-4 lg:border-b-0 lg:border-r">
            <h2 className="font-display text-lg font-bold">1. Médico</h2>
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
            <ul className="flex max-h-[19rem] flex-col gap-1 overflow-y-auto pr-1">
              {doctors.map((d) => {
                const selected = d.id === doctorId;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => pickDoctor(d.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border-2 p-2.5 text-left',
                        selected ? 'border-[var(--tone)] bg-[var(--tone)]/10' : 'border-transparent hover:border-rule',
                      )}
                    >
                      <span className={cn(landing.avatar, landing.avatarSmall)} aria-hidden>
                        {initials(d.fullName)}
                      </span>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate font-bold">{d.fullName}</span>
                        <span className="truncate text-sm text-ink-2">{d.specialty}</span>
                        <span className="text-xs text-ink-3">{daysShort(d.assignments.filter((a) => a.clinicId === clinicId).map((a) => a.weekday))}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 2. Calendario del mes */}
          <div className="flex min-w-0 flex-col gap-3 border-b border-rule p-4 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2">
              <h2 className="whitespace-nowrap font-display text-lg font-bold">2. Día</h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-9" aria-label="Mes anterior" disabled={month === 0} onClick={() => setMonth((m) => m - 1)}>
                  <ChevronLeft />
                </Button>
                <span className="whitespace-nowrap text-center text-sm font-bold first-letter:uppercase sm:min-w-36 sm:text-base">{monthName(first)}</span>
                <Button variant="ghost" size="icon" className="size-9" aria-label="Mes siguiente" disabled={monthStart(today, month + 1) > lastAllowed} onClick={() => setMonth((m) => m + 1)}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
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
                      'tabular flex h-10 w-full items-center justify-center rounded-lg text-sm font-bold sm:text-base',
                      d === date ? 'bg-[var(--tone)] text-[var(--tone-ink)]' : bookable.has(d) ? 'border-2 border-[var(--tone)]/40 text-ink hover:bg-[var(--tone)]/15' : 'font-normal text-ink-3/50',
                      d === today && d !== date && 'underline decoration-2 underline-offset-4',
                    )}
                  >
                    {Number(d.slice(8, 10))}
                  </button>
                ),
              )}
            </div>
            <p className="text-sm text-ink-3">{doctor ? `Días con borde: ${doctor.fullName} atiende en ${clinic?.name}.` : 'Elija un médico para ver sus días de atención.'}</p>
          </div>

          {/* 3. Hora y confirmación */}
          <div className="flex min-w-0 flex-col gap-3 p-4">
            <h2 className="font-display text-lg font-bold">3. Hora</h2>
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
              <>
                <div className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto">
                  {av.data.slots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      aria-pressed={slot?.startsAt === s.startsAt}
                      onClick={() => setSlot(s)}
                      className={cn(
                        'tabular min-h-10 rounded-lg border-2 font-bold',
                        slot?.startsAt === s.startsAt ? 'border-[var(--tone)] bg-[var(--tone)] text-[var(--tone-ink)]' : 'border-rule hover:border-[var(--tone)]',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {slot && doctor && date && (
              <div className="flex flex-col gap-2 border-t border-rule pt-3">
                <p className="text-sm">
                  <strong className="first-letter:uppercase">{dayLabel(date)}</strong>, a las <strong>{slot.label}</strong>, con <strong>{doctor.fullName}</strong>.
                </p>
                <Input aria-label="Motivo de la consulta (opcional)" placeholder="Motivo (opcional)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
                {book.isError && <Notice tone="danger">{errorMessage(book.error)}</Notice>}
                <Button size="lg" className="rounded-full" disabled={book.isPending} onClick={() => book.mutate()}>
                  <CalendarCheck /> {book.isPending ? 'Agendando…' : 'Confirmar cita'}
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Done({ appt: a }: { appt: PortalAppointment }) {
  return (
    <main className={cn(landing.gutter, 'pb-28 pt-12')}>
      <div className={cn(toneClass(a.clinic.name), 'mx-auto flex max-w-2xl flex-col gap-6 overflow-hidden rounded-2xl border-2 border-[var(--tone)] bg-surface')}>
        <div className="flex flex-col gap-2 bg-[var(--tone)] p-6 text-[var(--tone-ink)]">
          <PartyPopper className="size-10" aria-hidden />
          <h1 className="font-display text-4xl font-extrabold">¡Cita agendada!</h1>
          <p className="text-lg first-letter:uppercase">
            {longDate(a.startsAt)}, a las {time(a.startsAt)}
          </p>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <p className="text-lg">
            Con <strong>{a.doctorName}</strong> ({a.specialty.toLowerCase()}) en <strong>{a.clinic.name}</strong>
            {a.clinic.address && `, ${a.clinic.address}`}.
          </p>
          <p className="text-ink-2">Código de su cita: {a.code}. Llegue 10 minutos antes con su documento. Si no puede venir, cancélela desde “Mis citas” hasta 2 horas antes.</p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="rounded-full" asChild>
              <Link href="/paciente">Ver mis citas</Link>
            </Button>
            <Button variant="secondary" size="lg" className="rounded-full" asChild>
              <a href={a.link} target="_blank" rel="noreferrer">
                <ExternalLink /> Comprobante
              </a>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
