'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { AppointmentView } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Aceptar o rechazar una cita que el paciente pidió en línea. Rechazar pide una nota corta que el
 * paciente verá en "Mis citas" (por ejemplo, "el médico no atiende ese día; llámenos").
 */
export function RequestActions({ appt, size = 'md', onDone }: { appt: AppointmentView; size?: 'sm' | 'md'; onDone?: (a: AppointmentView) => void }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const refresh = (a: AppointmentView) => {
    qc.setQueryData(['appointments', 'one', a.id], a);
    void qc.invalidateQueries({ queryKey: ['appointments'] });
    void qc.invalidateQueries({ queryKey: ['availability'] });
    onDone?.(a);
  };
  const accept = useMutation({
    mutationFn: () => api<AppointmentView>(`/appointments/${appt.id}/accept`, { method: 'POST' }),
    onSuccess: (a) => (refresh(a), toast.success(`Cita de ${a.patient.fullName} aceptada.`)),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: () => api<AppointmentView>(`/appointments/${appt.id}/reject`, { method: 'POST', body: { note: note || null } }),
    onSuccess: (a) => (refresh(a), toast('Solicitud rechazada. El horario quedó libre.')),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (rejecting) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        <Input aria-label="Nota para el paciente" placeholder="Motivo para el paciente (opcional)" className="min-w-0 flex-1" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="danger" size={size} disabled={reject.isPending} onClick={() => reject.mutate()}>
          <XCircle /> Rechazar
        </Button>
        <Button variant="ghost" size={size} onClick={() => setRejecting(false)}>
          Volver
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} disabled={accept.isPending} onClick={() => accept.mutate()}>
        <CalendarCheck /> Aceptar
      </Button>
      <Button variant="secondary" size={size} onClick={() => setRejecting(true)}>
        <XCircle /> Rechazar
      </Button>
    </div>
  );
}
