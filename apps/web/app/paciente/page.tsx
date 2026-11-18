'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarPlus, CalendarX, CheckCircle2, ExternalLink, FileDown, Globe, Hourglass, MapPin, Phone, UserRound, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PORTAL_LIMITS, type PortalAppointment } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { localDate, longDate, time, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { Stat, StatGrid } from '@/components/ui/stat';
import { StatusBadge } from '@/components/appointments/status-badge';
import { PortalHeader, usePortalMe } from '@/components/portal/portal-header';
import landing from '@/components/landing/landing.module.css';
import { toneClass } from '@/components/landing/tone';

const pdfHref = (a: PortalAppointment) => `/api/portal/appointments/${a.id}/comprobante.pdf`;

/** "Hoy", "Mañana", "En 5 días": cuánto falta, en palabras. */
function whenLabel(iso: string) {
  const days = Math.round((Date.parse(`${localDate(iso)}T12:00:00Z`) - Date.parse(`${todayIso()}T12:00:00Z`)) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

/** Inicio del paciente: su próxima cita destacada, accesos rápidos, sus cifras y su historial. */
export default function PatientHomePage() {
  const me = usePortalMe();
  const list = useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => api<PortalAppointment[]>('/portal/appointments') });
  const [tab, setTab] = useState<'proximas' | 'historial'>('proximas');
  const now = Date.now();
  const all = list.data ?? [];
  const upcoming = all.filter((a) => (a.status === 'SCHEDULED' || a.status === 'REQUESTED') && new Date(a.startsAt).getTime() > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = all.filter((a) => !upcoming.includes(a));
  const next = upcoming[0];
  const atLimit = upcoming.length >= PORTAL_LIMITS.maxUpcoming;
  const count = (s: PortalAppointment['status']) => all.filter((a) => a.status === s).length;

  return (
    <>
      <PortalHeader />
      <main className={cn(landing.gutter, 'pb-28 pt-8')}>
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Hola{me.data ? `, ${me.data.firstNames.split(' ')[0]}` : ''}.</h1>
            <p className="text-lg text-ink-2">{next ? 'Esta es su próxima cita.' : 'No tiene citas por venir. Puede agendar una cuando quiera.'}</p>
          </div>

          {list.isPending ? (
            <Skeleton className="h-64" />
          ) : list.isError ? (
            <Notice tone="danger">{errorMessage(list.error)}</Notice>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              {next ? <NextAppointment appt={next} /> : <NoAppointment />}
              <QuickActions next={next} atLimit={atLimit} />
            </div>
          )}

          <StatGrid>
            <Stat label="Por venir" value={upcoming.length} icon={CalendarCheck} tone="info" note={`Hasta ${PORTAL_LIMITS.maxUpcoming} a la vez en línea`} />
            <Stat label="Por confirmar" value={count('REQUESTED')} icon={Hourglass} tone={count('REQUESTED') ? 'warn' : 'neutral'} note="La clínica las revisa" />
            <Stat label="Atendidas" value={count('ATTENDED')} icon={CheckCircle2} tone="good" note="Citas a las que asistió" />
            <Stat label="Canceladas" value={count('CANCELLED')} icon={CalendarX} note="Por usted o por la clínica" />
          </StatGrid>

          <section className="flex flex-col gap-4">
            <div role="tablist" aria-label="Mis citas" className="flex w-fit gap-1 rounded-lg border border-rule bg-surface p-1.5">
              {(
                [
                  ['proximas', `Próximas (${upcoming.length})`],
                  ['historial', `Historial (${past.length})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={cn('min-h-11 rounded-md px-4 font-bold', tab === value ? 'bg-ballpoint text-ballpoint-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'proximas' ? (
              upcoming.length ? (
                <ul className="grid auto-rows-fr gap-4 md:grid-cols-2">
                  {upcoming.map((a) => (
                    <UpcomingCard key={a.id} appt={a} />
                  ))}
                </ul>
              ) : (
                <EmptyState title="No tiene citas por venir">
                  <Link href="/paciente/agendar" className="font-bold text-ballpoint underline underline-offset-4">
                    Agende una ahora
                  </Link>
                  : elija clínica, médico y hora.
                </EmptyState>
              )
            ) : past.length ? (
              <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-surface">
                {past.map((a) => (
                  <li key={a.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <span className="flex min-w-0 items-start gap-3">
                      <span className={cn(landing.dot, toneClass(a.clinic.name), 'mt-2')} aria-hidden />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-bold first-letter:uppercase">
                          {longDate(a.startsAt)}, {time(a.startsAt)}
                        </span>
                        <span className="text-ink-2">
                          {a.doctorName} ({a.specialty.toLowerCase()}) · {a.clinic.name}
                        </span>
                        {a.rejectedNote !== null && <span className="text-sm text-ink-2">La clínica no pudo aceptarla{a.rejectedNote ? `: ${a.rejectedNote}` : '.'}</span>}
                      </span>
                    </span>
                    <StatusBadge status={a.status} />
                    <Button variant="ghost" size="sm" asChild>
                      <a href={pdfHref(a)} download={`comprobante-${a.code}.pdf`}>
                        <FileDown /> PDF
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Todavía no hay historial">Aquí aparecerán sus citas pasadas y canceladas.</EmptyState>
            )}
          </section>

          <BeforeYourVisit />
        </div>
      </main>
    </>
  );
}

/** La próxima cita, grande: cuánto falta, día, hora, dónde y qué hacer. */
function NextAppointment({ appt: a }: { appt: PortalAppointment }) {
  return (
    <article className={cn(toneClass(a.clinic.name), 'flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-[var(--tone)] bg-surface')}>
      <div className="flex flex-wrap items-end justify-between gap-3 bg-[var(--tone)] px-6 py-5 text-[var(--tone-ink)]">
        <div className="flex flex-col">
          <span className="text-sm font-bold opacity-90">{whenLabel(a.startsAt)}</span>
          <span className="font-display text-3xl font-extrabold first-letter:uppercase">{longDate(a.startsAt)}</span>
        </div>
        <span className="tabular font-display text-5xl font-extrabold leading-none">{time(a.startsAt)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xl font-bold">{a.doctorName}</p>
            <p className="text-ink-2">{a.specialty}</p>
          </div>
          <StatusBadge status={a.status} />
        </div>
        <p className="flex items-start gap-2 text-ink-2">
          <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="text-ink">{a.clinic.name}</strong>
            {a.clinic.address && `, ${a.clinic.address}`}
          </span>
        </p>
        {a.status === 'REQUESTED' && (
          <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>Por confirmar.</strong> El horario ya es suyo; la clínica revisará la solicitud y la confirmará.
            </span>
          </p>
        )}
        <AppointmentActions appt={a} primary />
      </div>
    </article>
  );
}

function NoAppointment() {
  return (
    <div className="flex flex-col items-start justify-center gap-4 rounded-2xl border-2 border-dashed border-rule-strong bg-surface p-8">
      <CalendarPlus className="size-10 text-ink-3" aria-hidden />
      <p className="font-display text-2xl font-bold">¿Necesita una cita?</p>
      <p className="text-ink-2">Elija la clínica, el médico y la hora que le queden mejor. La clínica la confirma y usted lo ve aquí.</p>
      <Button size="lg" className="rounded-full" asChild>
        <Link href="/paciente/agendar">
          <CalendarPlus /> Agendar una cita
        </Link>
      </Button>
    </div>
  );
}

type QuickItem = { key: string; icon: typeof Phone; label: string; hint: string; href?: string };

/** Lo que más se hace desde el portal, a un toque. */
function QuickActions({ next, atLimit }: { next?: PortalAppointment; atLimit: boolean }) {
  const items: QuickItem[] = [
    atLimit
      ? { key: 'agendar', icon: CalendarPlus, label: 'Agendar una cita', hint: `Ya tiene ${PORTAL_LIMITS.maxUpcoming} por venir: cancele una o llame` }
      : { key: 'agendar', icon: CalendarPlus, label: 'Agendar una cita', hint: 'Clínica, médico y hora', href: '/paciente/agendar' },
    { key: 'perfil', icon: UserRound, label: 'Mis datos', hint: 'Celular, correo y contraseña', href: '/paciente/perfil' },
    ...(next?.clinic.phone ? [{ key: 'llamar', icon: Phone, label: `Llamar a ${next.clinic.name}`, hint: next.clinic.phone, href: `tel:${next.clinic.phone.replace(/\D/g, '')}` }] : []),
    { key: 'clinicas', icon: Globe, label: 'Horarios y médicos', hint: 'Página de las clínicas', href: '/' },
  ];
  return (
    <nav aria-label="Accesos rápidos" className="flex flex-col gap-1 rounded-2xl border border-rule bg-surface p-3">
      <p className="px-2 pb-1 pt-1 font-bold text-ink-2">Accesos rápidos</p>
      {items.map((it) => {
        const body = (
          <>
            <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', it.href ? 'bg-ballpoint-soft text-ballpoint' : 'bg-surface-2 text-ink-3')} aria-hidden>
              <it.icon className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-bold">{it.label}</span>
              <span className="text-sm text-ink-3">{it.hint}</span>
            </span>
          </>
        );
        return it.href ? (
          <Link key={it.key} href={it.href} className="flex min-h-16 items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2">
            {body}
          </Link>
        ) : (
          <span key={it.key} className="flex min-h-16 items-center gap-3 rounded-xl px-3 py-2 opacity-60" aria-disabled>
            {body}
          </span>
        );
      })}
    </nav>
  );
}

function UpcomingCard({ appt: a }: { appt: PortalAppointment }) {
  return (
    <li className={cn(toneClass(a.clinic.name), 'flex min-w-0 flex-col overflow-hidden rounded-2xl border border-rule bg-surface')}>
      <div className="flex items-center gap-4 border-b border-rule px-5 py-4">
        <span className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-[var(--tone)] py-1.5 text-[var(--tone-ink)]">
          <span className="text-xs font-bold">{new Intl.DateTimeFormat('es-EC', { month: 'short', timeZone: 'America/Guayaquil' }).format(new Date(a.startsAt))}</span>
          <span className="tabular font-display text-2xl font-extrabold leading-none">{Number(localDate(a.startsAt).slice(8, 10))}</span>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-bold first-letter:uppercase">
            {longDate(a.startsAt)}, {time(a.startsAt)}
          </span>
          <span className="truncate text-ink-2">
            {a.doctorName} · {a.clinic.name}
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={a.status} />
          <span className="text-sm text-ink-3">Código {a.code}</span>
        </div>
        <AppointmentActions appt={a} />
      </div>
    </li>
  );
}

/** Descargar el comprobante, verlo en línea o cancelar (con confirmación). */
function AppointmentActions({ appt: a, primary = false }: { appt: PortalAppointment; primary?: boolean }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const size = primary ? 'md' : 'sm';
  const cancel = useMutation({
    mutationFn: () => api(`/portal/appointments/${a.id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'appointments'] });
      toast.success('Cita cancelada. Gracias por avisar: el espacio pasa a otro paciente.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-rule pt-4">
      <Button size={size} asChild>
        <a href={pdfHref(a)} download={`comprobante-${a.code}.pdf`}>
          <FileDown /> Descargar PDF
        </a>
      </Button>
      <Button variant="secondary" size={size} asChild>
        <a href={a.link} target="_blank" rel="noreferrer">
          <ExternalLink /> Ver en línea
        </a>
      </Button>
      {a.canCancel ? (
        confirm ? (
          <span className="flex flex-wrap items-center gap-2">
            <Button variant="danger" size={size} disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              <XCircle /> Sí, cancelar
            </Button>
            <Button variant="ghost" size={size} onClick={() => setConfirm(false)}>
              No
            </Button>
          </span>
        ) : (
          <Button variant="ghost" size={size} onClick={() => setConfirm(true)}>
            <XCircle /> Cancelar cita
          </Button>
        )
      ) : (
        <span className="text-sm text-ink-3">Falta poco: para cancelar, llame a la clínica.</span>
      )}
    </div>
  );
}

/** Recordatorio de qué llevar, el mismo de la página pública. */
function BeforeYourVisit() {
  return (
    <section className="grid gap-4 rounded-2xl bg-[var(--euc)] p-6 text-[var(--euc-ink)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <h2 className="font-display text-2xl font-extrabold">Antes de su cita</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>Llegue 10 minutos antes para registrarse con calma.</li>
        <li>Traiga su cédula o pasaporte.</li>
        <li>Lleve exámenes y recetas anteriores, y las medicinas que toma.</li>
        <li>¿No puede ir? Cancele aquí hasta 2 horas antes: el espacio pasa a otro paciente.</li>
      </ul>
    </section>
  );
}
