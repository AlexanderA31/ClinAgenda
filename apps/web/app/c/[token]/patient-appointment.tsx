'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX, CheckCircle2, MapPin, Phone } from 'lucide-react';
import { CANCEL_LINK_HOURS, type PublicAppointmentView } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { dayLabel, time } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Notice, Skeleton } from '@/components/ui/misc';
import { StatusBadge } from '@/components/appointments/status-badge';

/** Pantalla del paciente: ver su cita y cancelarla con dos toques. Sin usuario, sin datos personales sensibles. */
export function PatientAppointment({ token }: { token: string }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const appt = useQuery({ queryKey: ['public', token], queryFn: () => api<PublicAppointmentView>(`/public/appointments/${token}`), retry: false });
  const cancel = useMutation({
    mutationFn: () => api<PublicAppointmentView & { alreadyCancelled: boolean }>(`/public/appointments/${token}/cancel`, { method: 'POST', body: { confirm: true } }),
    onSuccess: (a) => {
      qc.setQueryData(['public', token], a);
      setConfirming(false);
    },
  });

  if (appt.isPending) return <Skeleton className="h-80 w-full max-w-md" />;
  if (appt.isError) {
    return (
      <div className="w-full max-w-md">
        <Notice tone="warn" title="No encontramos esa cita">
          {errorMessage(appt.error)} Si tiene dudas, llame a la clínica.
        </Notice>
      </div>
    );
  }
  const a = appt.data;
  const cancelled = a.status === 'CANCELLED';

  return (
    <article className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-rule bg-surface p-6 shadow-sm">
      <header className="flex flex-col gap-1">
        <p className="font-display font-extrabold text-ballpoint">ClinAgenda</p>
        <h1 className="text-2xl font-extrabold">Hola, {a.patientFirstName}</h1>
        <p className="text-ink-2">Esta es su cita:</p>
      </header>

      <div className="flex flex-col gap-1 rounded-md bg-surface-2 px-4 py-3">
        <StatusBadge status={a.status} />
        <p className="mt-1 text-2xl font-bold first-letter:uppercase">{dayLabel(a.startsAt.slice(0, 10))}</p>
        <p className="font-mono text-3xl font-medium">{time(a.startsAt)}</p>
        <p className="mt-1">
          {a.doctorName} · <span className="text-ink-2">{a.specialty}</span>
        </p>
        <p className="font-mono text-sm text-ink-3">Código {a.code}</p>
      </div>

      <div className="flex flex-col gap-2 text-ink-2">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            <strong className="text-ink">{a.clinic.name}</strong>
            {a.clinic.address && <span className="block">{a.clinic.address}</span>}
          </span>
        </p>
        {a.clinic.phone && (
          <p className="flex items-center gap-2">
            <Phone className="size-5 shrink-0" aria-hidden /> <span className="font-mono">{a.clinic.phone}</span>
          </p>
        )}
      </div>

      {cancelled ? (
        <Notice tone="good" title="Su cita está cancelada">
          Gracias por avisar: el espacio quedó libre para otro paciente. Si se equivocó o quiere otra fecha, llame a la clínica.
        </Notice>
      ) : a.canCancel ? (
        confirming ? (
          <div className="flex flex-col gap-3 rounded-md border-2 border-redpen/40 bg-redpen-soft/50 p-4">
            <p className="font-bold">¿Seguro que quiere cancelar su cita?</p>
            {cancel.isError && <Notice tone="danger">{errorMessage(cancel.error)}</Notice>}
            <Button variant="danger" size="lg" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              <CalendarX /> Sí, cancelar mi cita
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              No, mantener mi cita
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button variant="secondary" size="lg" onClick={() => setConfirming(true)}>
              <CalendarX /> No podré ir: cancelar la cita
            </Button>
            <p className="text-sm text-ink-3">Puede cancelar aquí hasta {CANCEL_LINK_HOURS} horas antes de la cita. Para cambiar la fecha, llame a la clínica.</p>
          </div>
        )
      ) : (
        a.status === 'SCHEDULED' && (
          <Notice tone="info" title="Ya falta poco para su cita">
            Para cancelar a esta hora, llame a la clínica{a.clinic.phone ? ` al ${a.clinic.phone}` : ''}.
          </Notice>
        )
      )}
      {a.status === 'ATTENDED' && (
        <p className="flex items-center gap-2 text-good">
          <CheckCircle2 className="size-5" /> Esta cita ya fue atendida.
        </p>
      )}
    </article>
  );
}
