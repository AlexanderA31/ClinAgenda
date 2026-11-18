'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarCheck, Check, ExternalLink, MapPin, PartyPopper } from 'lucide-react';
import { PORTAL_LIMITS, WEEKDAY_LABELS, type PortalAppointment, type PortalSlot, type PublicDirectory } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { addDays, dayLabel, longDate, time, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Notice, Skeleton } from '@/components/ui/misc';
import landing from '@/components/landing/landing.module.css';
import { daysShort, scheduleLines } from '@/components/landing/hours';
import { initials, toneClass } from '@/components/landing/tone';

type Clinic = PublicDirectory['clinics'][number];
type Doctor = PublicDirectory['doctors'][number];

const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/**
 * Agendar en tres pasos, con botones grandes: 1) clínica, 2) médico y día, 3) hora.
 * Solo se muestran días en que el médico atiende en esa clínica y horarios realmente libres.
 */
export function BookingFlow({ directory }: { directory: PublicDirectory }) {
  const params = useSearchParams();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [specialty, setSpecialty] = useState('');
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<PortalSlot | null>(null);
  const [done, setDone] = useState<PortalAppointment | null>(null);
  const step = !clinic ? 1 : !doctor || !date ? 2 : 3;

  const reset = (to: 1 | 2) => {
    if (to === 1) setClinic(null);
    setDoctor(null);
    setDate(null);
    setSlot(null);
  };

  if (done) return <Done appt={done} />;

  return (
    <main className={cn(landing.gutter, 'pb-28 pt-10')}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-4">
          {params.get('nuevo') && (
            <Notice tone="good" title="¡Su cuenta está lista!">
              Ya puede agendar su primera cita.
            </Notice>
          )}
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Agendar una cita</h1>
          <ol className="grid grid-cols-3 gap-2" aria-label="Pasos">
            {['Clínica', 'Médico y día', 'Hora'].map((label, i) => (
              <li key={label} className="flex flex-col gap-1.5" aria-current={step === i + 1 ? 'step' : undefined}>
                <span className={cn('h-1.5 rounded-full', step > i ? 'bg-[var(--euc)]' : 'bg-rule')} aria-hidden />
                <span className={cn('text-sm sm:text-base', step === i + 1 ? 'font-bold text-ink' : 'text-ink-3')}>
                  {i + 1}. {label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {step === 1 && <ChooseClinic clinics={directory.clinics} onPick={setClinic} />}

        {clinic && step >= 2 && <Summary clinic={clinic} doctor={doctor} date={date} onChangeClinic={() => reset(1)} onChangeDoctor={doctor ? () => reset(2) : undefined} />}

        {clinic && step === 2 && (
          <ChooseDoctorAndDay
            clinic={clinic}
            doctors={directory.doctors}
            specialty={specialty}
            setSpecialty={setSpecialty}
            doctor={doctor}
            setDoctor={(d) => (setDoctor(d), setDate(null))}
            onPickDate={setDate}
          />
        )}

        {clinic && doctor && date && step === 3 && (
          <ChooseTime clinic={clinic} doctor={doctor} date={date} slot={slot} setSlot={setSlot} onBack={() => (setDate(null), setSlot(null))} onDone={setDone} />
        )}
      </div>
    </main>
  );
}

function ChooseClinic({ clinics, onPick }: { clinics: Clinic[]; onPick: (c: Clinic) => void }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="paso-clinica">
      <h2 id="paso-clinica" className="font-display text-2xl font-bold">
        ¿En qué clínica?
      </h2>
      <ul className="grid auto-rows-fr gap-4 md:grid-cols-3">
        {clinics.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className={cn(landing.clinic, toneClass(c.name), 'flex h-full w-full flex-col gap-3 p-6 text-left hover:brightness-105 focus-visible:outline-offset-4')}
            >
              <span className={cn(landing.clinicName, '!text-[3.25rem]')}>{c.name.replace('Clínica ', '')}</span>
              {c.address && (
                <span className="flex items-start gap-2">
                  <MapPin className="mt-1 size-4 shrink-0" aria-hidden /> {c.address}
                </span>
              )}
              <span className="text-sm opacity-90">
                {scheduleLines(c.schedule).map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </span>
              <span className={cn(landing.clinicCall, 'mt-auto flex min-h-12 items-center justify-center rounded-full font-bold')}>Elegir {c.name.replace('Clínica ', '')}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Summary({ clinic, doctor, date, onChangeClinic, onChangeDoctor }: { clinic: Clinic; doctor: Doctor | null; date: string | null; onChangeClinic: () => void; onChangeDoctor?: () => void }) {
  return (
    <div className={cn(toneClass(clinic.name), 'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border-2 border-[var(--tone)] bg-surface px-4 py-3')}>
      <span className="flex items-center gap-2">
        <span className={landing.dot} aria-hidden />
        <strong>{clinic.name}</strong>
        <Button variant="link" size="sm" onClick={onChangeClinic}>
          Cambiar
        </Button>
      </span>
      {doctor && (
        <span className="flex items-center gap-2">
          <strong>{doctor.fullName}</strong>
          {date && <span className="text-ink-2 first-letter:uppercase">· {dayLabel(date)}</span>}
          {onChangeDoctor && (
            <Button variant="link" size="sm" onClick={onChangeDoctor}>
              Cambiar
            </Button>
          )}
        </span>
      )}
    </div>
  );
}

function ChooseDoctorAndDay({
  clinic,
  doctors,
  specialty,
  setSpecialty,
  doctor,
  setDoctor,
  onPickDate,
}: {
  clinic: Clinic;
  doctors: Doctor[];
  specialty: string;
  setSpecialty: (s: string) => void;
  doctor: Doctor | null;
  setDoctor: (d: Doctor) => void;
  onPickDate: (d: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const here = doctors.filter((d) => d.assignments.some((a) => a.clinicId === clinic.id));
  const specialties = [...new Set(here.map((d) => d.specialty))].sort();
  const visible = specialty ? here.filter((d) => d.specialty === specialty) : here;

  // Días en que el médico atiende en esta clínica, sin cierres, desde mañana hasta el límite del portal.
  const days = useMemo(() => {
    if (!doctor) return [];
    const weekdays = new Set(doctor.assignments.filter((a) => a.clinicId === clinic.id).map((a) => a.weekday));
    const closed = new Set(clinic.closures.map((c) => c.date));
    const out: string[] = [];
    for (let i = 0; i <= PORTAL_LIMITS.maxDaysAhead; i++) {
      const d = addDays(todayIso(), i);
      if (weekdays.has(weekdayOf(d)) && !closed.has(d)) out.push(d);
    }
    return out;
  }, [doctor, clinic]);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="paso-medico">
      <div className="flex flex-col gap-3">
        <h2 id="paso-medico" className="font-display text-2xl font-bold">
          ¿Con qué médico?
        </h2>
        {specialties.length > 1 && (
          <div role="radiogroup" aria-label="Especialidad" className="flex flex-wrap gap-2">
            {['', ...specialties].map((s) => (
              <button
                key={s || 'todas'}
                type="button"
                role="radio"
                aria-checked={specialty === s}
                onClick={() => setSpecialty(s)}
                className={cn(
                  'min-h-11 rounded-full border-2 px-4 font-bold',
                  specialty === s ? 'border-[var(--euc)] bg-[var(--euc)] text-[var(--euc-ink)]' : 'border-rule-strong text-ink-2 hover:border-[var(--euc)]',
                )}
              >
                {s || 'Todas las especialidades'}
              </button>
            ))}
          </div>
        )}
        <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((d) => {
            const slots = d.assignments.filter((a) => a.clinicId === clinic.id);
            const selected = doctor?.id === d.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setDoctor(d)}
                  className={cn(
                    'flex h-full w-full items-center gap-4 rounded-2xl border-2 p-4 text-left',
                    selected ? 'border-[var(--euc)] bg-[var(--euc)]/10' : 'border-rule bg-surface hover:border-[var(--euc)]',
                  )}
                >
                  <span className={cn(landing.avatar, toneClass(clinic.name))} aria-hidden>
                    {initials(d.fullName)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-display text-lg font-bold leading-tight">{d.fullName}</span>
                    <span className="text-ink-2">{d.specialty}</span>
                    <span className="text-sm text-ink-3">{daysShort(slots.map((a) => a.weekday))}</span>
                  </span>
                  {selected && <Check className="ml-auto size-6 shrink-0 text-[var(--euc)]" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {doctor && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold">¿Qué día?</h2>
          {days.length ? (
            <>
              <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:grid-cols-10">
                {(showAll ? days : days.slice(0, 20)).map((d) => (
                  <li key={d}>
                    <button
                      type="button"
                      onClick={() => onPickDate(d)}
                      className="flex min-h-14 w-full flex-col items-center justify-center rounded-lg border-2 border-rule bg-surface px-1 py-1 leading-tight hover:border-[var(--euc)] hover:bg-[var(--euc)]/10"
                    >
                      <span className="text-xs text-ink-2">{d === todayIso() ? 'Hoy' : WEEKDAY_LABELS[weekdayOf(d)].slice(0, 3)}</span>
                      <span className="tabular font-display text-lg font-extrabold">{Number(d.slice(8, 10))}</span>
                      <span className="text-xs text-ink-3">{new Intl.DateTimeFormat('es-EC', { month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {!showAll && days.length > 20 && (
                <Button variant="secondary" className="w-fit rounded-full" onClick={() => setShowAll(true)}>
                  Ver más días
                </Button>
              )}
            </>
          ) : (
            <Notice tone="info">Este médico no tiene días disponibles en línea en esta clínica. Llame a la clínica para coordinar.</Notice>
          )}
        </div>
      )}
    </section>
  );
}

function ChooseTime({
  clinic,
  doctor,
  date,
  slot,
  setSlot,
  onBack,
  onDone,
}: {
  clinic: Clinic;
  doctor: Doctor;
  date: string;
  slot: PortalSlot | null;
  setSlot: (s: PortalSlot | null) => void;
  onBack: () => void;
  onDone: (a: PortalAppointment) => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const av = useQuery({
    queryKey: ['portal', 'availability', clinic.id, date, doctor.id],
    queryFn: () => api<{ closed: string | null; slots: PortalSlot[] }>('/portal/availability', { query: { clinicId: clinic.id, date, doctorId: doctor.id } }),
  });
  const book = useMutation({
    mutationFn: () => api<PortalAppointment>('/portal/appointments', { method: 'POST', body: { clinicId: clinic.id, doctorId: doctor.id, startsAt: slot!.startsAt, reason: reason || null } }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['portal'] });
      onDone(a);
    },
    onError: (e) => {
      // Si alguien tomó la hora mientras tanto, se actualizan los horarios libres.
      if (e instanceof ApiRequestError && e.status === 409) void av.refetch();
    },
  });
  const morning = (av.data?.slots ?? []).filter((s) => s.label < '12:00');
  const afternoon = (av.data?.slots ?? []).filter((s) => s.label >= '12:00');

  const group = (label: string, list: PortalSlot[]) =>
    list.length > 0 && (
      <div className="flex flex-col gap-2">
        <p className="font-bold text-ink-2">{label}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {list.map((s) => (
            <button
              key={s.startsAt}
              type="button"
              aria-pressed={slot?.startsAt === s.startsAt}
              onClick={() => setSlot(s)}
              className={cn(
                'tabular min-h-14 rounded-xl border-2 text-lg font-bold',
                slot?.startsAt === s.startsAt ? 'border-[var(--euc)] bg-[var(--euc)] text-[var(--euc-ink)]' : 'border-rule bg-surface hover:border-[var(--euc)]',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <section className="flex flex-col gap-6" aria-labelledby="paso-hora">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="paso-hora" className="font-display text-2xl font-bold">
          ¿A qué hora?
        </h2>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Otro día
        </Button>
      </div>
      {av.isPending ? (
        <Skeleton className="h-40" />
      ) : av.isError ? (
        <Notice tone="danger">{errorMessage(av.error)}</Notice>
      ) : av.data.closed ? (
        <Notice tone="warn" title="Ese día la clínica no atiende">
          {av.data.closed}
        </Notice>
      ) : !av.data.slots.length ? (
        <Notice tone="info" title="No quedan horarios libres ese día">
          Elija otro día. Recuerde que en línea se agenda con al menos {PORTAL_LIMITS.minHoursAhead} horas de anticipación.
        </Notice>
      ) : (
        <>
          {group('Mañana', morning)}
          {group('Tarde', afternoon)}
        </>
      )}

      {slot && (
        <div className={cn(toneClass(clinic.name), 'flex flex-col gap-4 rounded-2xl border-2 border-[var(--tone)] bg-surface p-5')}>
          <p className="font-display text-xl font-bold">Revise su cita</p>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-ink-2">Día</dt>
            <dd className="font-bold first-letter:uppercase">{dayLabel(date)}</dd>
            <dt className="text-ink-2">Hora</dt>
            <dd className="tabular font-bold">{slot.label}</dd>
            <dt className="text-ink-2">Médico</dt>
            <dd className="font-bold">
              {doctor.fullName}, {doctor.specialty.toLowerCase()}
            </dd>
            <dt className="text-ink-2">Clínica</dt>
            <dd className="font-bold">
              {clinic.name}
              {clinic.address && <span className="font-normal text-ink-2">, {clinic.address}</span>}
            </dd>
          </dl>
          <Field id="b-reason" label="Motivo de la consulta" optional hint="Ayuda al médico a prepararse. No escriba datos que no quiera compartir.">
            <Textarea rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {book.isError && <Notice tone="danger">{errorMessage(book.error)}</Notice>}
          <Button size="lg" className="rounded-full" disabled={book.isPending} onClick={() => book.mutate()}>
            <CalendarCheck /> {book.isPending ? 'Agendando…' : 'Confirmar cita'}
          </Button>
        </div>
      )}
    </section>
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
