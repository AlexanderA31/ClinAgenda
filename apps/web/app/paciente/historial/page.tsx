'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, FileDown } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { longDate, time } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { StatusBadge } from '@/components/appointments/status-badge';
import { PortalHeader } from '@/components/portal/portal-header';
import { UpcomingCard, pdfHref, splitAppointments, usePortalAppointments } from '@/components/portal/appointments';
import landing from '@/components/landing/landing.module.css';
import { toneClass } from '@/components/landing/tone';

/** Historial del paciente: sus citas próximas y las pasadas o canceladas, cada una con su comprobante. */
export default function PatientHistoryPage() {
  const list = usePortalAppointments();
  const { upcoming, past } = splitAppointments(list.data);
  const [tab, setTab] = useState<'proximas' | 'historial'>('proximas');

  return (
    <>
      <PortalHeader />
      <main className={cn(landing.gutter, 'pb-28 pt-8')}>
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Historial</h1>
              <p className="text-lg text-ink-2">Todas sus citas: las que vienen y las que ya pasaron. Descargue el comprobante de cualquiera.</p>
            </div>
            <Button size="lg" className="rounded-full" asChild>
              <Link href="/paciente/agendar">
                <CalendarPlus /> Agendar una cita
              </Link>
            </Button>
          </div>

          {list.isPending ? (
            <Skeleton className="h-64" />
          ) : list.isError ? (
            <Notice tone="danger">{errorMessage(list.error)}</Notice>
          ) : (
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
          )}
        </div>
      </main>
    </>
  );
}
