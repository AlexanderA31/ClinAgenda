'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarX } from 'lucide-react';
import { toast } from 'sonner';
import { WEEKDAY_LABELS, type ClinicView } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { dayLabel, todayIso } from '@/lib/format';
import { useClinics } from '@/lib/queries';
import { useCan } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice, PageHeader, Skeleton } from '@/components/ui/misc';

export default function ClinicsPage() {
  const clinics = useClinics();
  return (
    <>
      <PageHeader title="Clínicas" description="Cada clínica tiene su propio horario. Los días cerrados (feriados) no permiten agendar." />
      {clinics.isPending ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {clinics.data?.map((c) => <ClinicCard key={c.id} clinic={c} />)}
        </div>
      )}
    </>
  );
}

function ClinicCard({ clinic }: { clinic: ClinicView }) {
  const isAdmin = useCan('ADMIN');
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const close = useMutation({
    mutationFn: () => api<{ appointmentsToReschedule: number }>(`/clinics/${clinic.id}/closures`, { method: 'POST', body: { date, reason } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['clinics'] });
      setDate('');
      setReason('');
      toast.success(
        r.appointmentsToReschedule
          ? `Día cerrado. Hay ${r.appointmentsToReschedule} cita(s) ese día: llame a esos pacientes para cambiarlas.`
          : 'Día cerrado. No había citas ese día.',
        { duration: 15000 },
      );
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{clinic.name}</CardTitle>
        <p className="text-ink-2">{clinic.address}</p>
        <p className="text-sm text-ink-3">Turnos de {clinic.slotMinutes} minutos</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const s = clinic.schedule.filter((x) => x.weekday === d);
            return (
              <div key={d} className="contents">
                <dt className="text-ink-2">{WEEKDAY_LABELS[d]}</dt>
                <dd className="font-mono">{s.length ? s.map((x) => `${x.startTime}–${x.endTime}`).join(', ') : <span className="font-sans text-ink-3">Cerrado</span>}</dd>
              </div>
            );
          })}
        </dl>
        {clinic.closures.length > 0 && (
          <div>
            <p className="font-bold">Próximos cierres</p>
            <ul className="text-ink-2">
              {clinic.closures.map((c) => (
                <li key={c.id} className="first-letter:uppercase">
                  {dayLabel(c.date)}: <span className="normal-case">{c.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isAdmin && (
          <form
            className="flex flex-col gap-3 border-t border-rule pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              close.mutate();
            }}
          >
            <p className="font-bold">Cerrar un día</p>
            {close.isError && <Notice tone="danger">{errorMessage(close.error)}</Notice>}
            <Field id={`closure-date-${clinic.id}`} label="Fecha">
              <Input type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field id={`closure-reason-${clinic.id}`} label="Motivo">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Feriado, mantenimiento…" />
            </Field>
            <Button type="submit" variant="secondary" disabled={!date || reason.length < 3 || close.isPending}>
              <CalendarX /> Cerrar ese día
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
