'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ExternalLink, MapPin, Phone, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PORTAL_LIMITS, type PortalAppointment } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { longDate, localDate, time, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { StatusBadge } from '@/components/appointments/status-badge';
import { PortalHeader, usePortalMe } from '@/components/portal/portal-header';
import landing from '@/components/landing/landing.module.css';
import { toneClass } from '@/components/landing/tone';

export default function MyAppointmentsPage() {
  const me = usePortalMe();
  const list = useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => api<PortalAppointment[]>('/portal/appointments') });
  const now = Date.now();
  const upcoming = (list.data ?? []).filter((a) => a.status === 'SCHEDULED' && new Date(a.startsAt).getTime() > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = (list.data ?? []).filter((a) => !upcoming.includes(a));
  const atLimit = upcoming.length >= PORTAL_LIMITS.maxUpcoming;

  return (
    <>
      <PortalHeader />
      <main className={cn(landing.gutter, 'pb-28 pt-10')}>
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Mis citas</h1>
              {me.data && (
                <p className="text-lg text-ink-2">
                  {me.data.firstNames} {me.data.lastNames} · ficha {me.data.patientCode}
                </p>
              )}
            </div>
            {atLimit ? (
              <Button size="lg" className="rounded-full" disabled>
                <CalendarPlus /> Agendar una cita
              </Button>
            ) : (
              <Button size="lg" className="rounded-full" asChild>
                <Link href="/paciente/agendar">
                  <CalendarPlus /> Agendar una cita
                </Link>
              </Button>
            )}
          </div>
          {atLimit && (
            <Notice tone="info" title={`Ya tiene ${upcoming.length} citas por venir`}>
              En línea se pueden tener hasta {PORTAL_LIMITS.maxUpcoming} a la vez. Si necesita otra, cancele una o llame a su clínica.
            </Notice>
          )}

          <section className="flex flex-col gap-4" aria-labelledby="proximas">
            <h2 id="proximas" className="font-display text-2xl font-bold">
              Próximas
            </h2>
            {list.isPending ? (
              <Skeleton className="h-48" />
            ) : list.isError ? (
              <Notice tone="danger">{errorMessage(list.error)}</Notice>
            ) : upcoming.length ? (
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
            )}
          </section>

          {past.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="historial">
              <h2 id="historial" className="font-display text-2xl font-bold">
                Historial
              </h2>
              <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-surface">
                {past.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-bold first-letter:uppercase">
                        {longDate(a.startsAt)}, {time(a.startsAt)}
                      </span>
                      <span className="text-ink-2">
                        {a.doctorName} · {a.clinic.name}
                      </span>
                    </span>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

function UpcomingCard({ appt: a }: { appt: PortalAppointment }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api(`/portal/appointments/${a.id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'appointments'] });
      toast.success('Cita cancelada. Gracias por avisar: el espacio pasa a otro paciente.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const isToday = localDate(a.startsAt) === todayIso();
  return (
    <li className={cn(toneClass(a.clinic.name), 'flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-[var(--tone)] bg-surface')}>
      <div className="flex items-baseline justify-between gap-3 bg-[var(--tone)] px-5 py-4 text-[var(--tone-ink)]">
        <span className="font-display text-2xl font-extrabold first-letter:uppercase">{isToday ? 'Hoy' : longDate(a.startsAt)}</span>
        <span className="tabular font-display text-3xl font-extrabold">{time(a.startsAt)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="text-lg font-bold">{a.doctorName}</p>
          <p className="text-ink-2">{a.specialty}</p>
        </div>
        <p className="flex items-start gap-2 text-ink-2">
          <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="text-ink">{a.clinic.name}</strong>
            {a.clinic.address && `, ${a.clinic.address}`}
          </span>
        </p>
        {a.clinic.phone && (
          <p className="flex items-center gap-2 text-ink-2">
            <Phone className="size-4 shrink-0" aria-hidden /> {a.clinic.phone}
          </p>
        )}
        <p className="text-sm text-ink-3">Código {a.code}. Llegue 10 minutos antes con su documento.</p>
        <div className="mt-auto flex flex-wrap gap-2 border-t border-rule pt-4">
          <Button variant="secondary" size="sm" asChild>
            <a href={a.link} target="_blank" rel="noreferrer">
              <ExternalLink /> Comprobante
            </a>
          </Button>
          {a.canCancel ? (
            confirm ? (
              <span className="flex flex-wrap items-center gap-2">
                <Button variant="danger" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                  <XCircle /> Sí, cancelar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                  No
                </Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
                <XCircle /> Cancelar cita
              </Button>
            )
          ) : (
            <span className="self-center text-sm text-ink-3">Falta poco: para cancelar, llame a la clínica.</span>
          )}
        </div>
      </div>
    </li>
  );
}
