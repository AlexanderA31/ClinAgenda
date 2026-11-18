'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileDown, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { PortalAppointment } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { localDate, longDate, time } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/appointments/status-badge';
import { toneClass } from '@/components/landing/tone';

export const pdfHref = (a: PortalAppointment) => `/api/portal/appointments/${a.id}/comprobante.pdf`;

export function usePortalAppointments() {
  return useQuery({ queryKey: ['portal', 'appointments'], queryFn: () => api<PortalAppointment[]>('/portal/appointments') });
}

/** Próximas: agendadas o por confirmar que todavía no pasan, la más cercana primero. Lo demás es historial. */
export function splitAppointments(data: PortalAppointment[] | undefined) {
  const now = Date.now();
  const all = data ?? [];
  const upcoming = all.filter((a) => (a.status === 'SCHEDULED' || a.status === 'REQUESTED') && new Date(a.startsAt).getTime() > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = all.filter((a) => !upcoming.includes(a));
  return { all, upcoming, past };
}

export function UpcomingCard({ appt: a }: { appt: PortalAppointment }) {
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
export function AppointmentActions({ appt: a, primary = false }: { appt: PortalAppointment; primary?: boolean }) {
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
