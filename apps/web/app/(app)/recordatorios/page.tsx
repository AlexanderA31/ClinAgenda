'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageCircle, Phone } from 'lucide-react';
import { toast } from 'sonner';
import type { AppointmentView } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { addDays, dayLabel, phone, time, todayIso } from '@/lib/format';
import { useAppointments, useWorkClinics } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { reminderText, waLink } from '@/lib/whatsapp';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { RequirePermission } from '@/components/layout/require-role';
import { cn } from '@/lib/utils';

export default function RemindersPage() {
  return (
    <RequirePermission permission="recordatorios.gestionar">
      <Reminders />
    </RequirePermission>
  );
}

/**
 * Lista de llamadas del día: las citas de mañana para avisar a cada paciente. Marcar "avisado" queda
 * guardado con nombre y hora, así dos recepcionistas no llaman dos veces al mismo paciente.
 * Recordar reduce inasistencias y, si el paciente ya no puede venir, el espacio se libera a tiempo.
 */
function Reminders() {
  const user = useSession();
  const qc = useQueryClient();
  const clinics = useWorkClinics();
  const [date, setDate] = useState(addDays(todayIso(), 1));
  // Quien trabaja en una sola clínica la ve elegida; si son varias, "todas" son las suyas.
  const [clinicId, setClinicId] = useState(user.clinicIds.length === 1 ? user.clinicIds[0] : '');
  const list = useAppointments({ from: date, to: date, clinicId: clinicId || undefined, status: 'SCHEDULED', pageSize: 500, sortBy: 'startsAt' });
  const mark = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => api<AppointmentView>(`/appointments/${id}/reminded`, { method: 'PATCH', body: { reminded: value } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['appointments'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const items = list.data?.items ?? [];
  const pending = items.filter((a) => !a.remindedAt).length;

  return (
    <>
      <PageHeader
        title="Recordatorios"
        description="Avise a cada paciente de su cita. El mensaje de WhatsApp lleva su enlace para cancelar si ya no puede venir, así el espacio se libera a tiempo."
      />
      <div className="flex flex-wrap items-end gap-3">
        <Input type="date" aria-label="Día" className="w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Select aria-label="Clínica" className="w-auto" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
          <option value="">Todas las clínicas</option>
          {clinics.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <p className="tabular text-ink-2 first-letter:uppercase">
          {dayLabel(date)}: {items.length} citas · <strong className="text-ink">{pending} por avisar</strong>
        </p>
      </div>
      {list.isPending ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState title="No hay citas que recordar">Elija otro día u otra clínica.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.id} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface px-4 py-3', a.remindedAt ? 'border-rule opacity-75' : 'border-rule-strong')}>
              <div className="flex min-w-0 items-start gap-4">
                <span className="w-14 pt-0.5 font-mono text-lg font-medium">{time(a.startsAt)}</span>
                <div className="min-w-0">
                  <p className="font-bold">{a.patient.fullName}</p>
                  <p className="text-ink-2">
                    {a.doctor.fullName} · {a.clinic.name.replace('Clínica ', '')}
                  </p>
                  {a.contactPhone ? <p className="font-mono text-ink-2">{phone(a.contactPhone)}</p> : <p className="text-warn">Sin teléfono. {a.contactNote}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {a.remindedAt ? (
                  <Badge tone="good">
                    <CheckCircle2 aria-hidden /> Avisado por {a.remindedBy ?? 'alguien'}
                  </Badge>
                ) : null}
                {a.contactPhone && (
                  <>
                    <Button asChild size="sm">
                      <a href={waLink(a.contactPhone, reminderText(a))} target="_blank" rel="noreferrer" onClick={() => !a.remindedAt && mark.mutate({ id: a.id, value: true })}>
                        <MessageCircle /> WhatsApp
                      </a>
                    </Button>
                    <Button asChild variant="secondary" size="sm">
                      <a href={`tel:${a.contactPhone}`}>
                        <Phone /> Llamar
                      </a>
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => mark.mutate({ id: a.id, value: !a.remindedAt })}>
                  {a.remindedAt ? 'Desmarcar' : 'Marcar avisado'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
