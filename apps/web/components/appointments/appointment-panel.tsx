'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarClock, CheckCircle2, ClipboardList, Copy, History, MessageCircle, NotebookPen, Printer, Undo2, UserX, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { CANCEL_REASON_LABELS, STAFF_CANCEL_REASONS, type AppointmentView, type AvailabilitySlot } from '@clinagenda/schemas';
import { OfflineError, api, errorMessage } from '@/lib/api';
import { enqueue, newKey } from '@/lib/offline-queue';
import { confirmationText, patientUrl, reminderText, waLink } from '@/lib/whatsapp';
import { dateTime, phone, time, longDate } from '@/lib/format';
import { useAppointment, useAppointmentEvents } from '@/lib/queries';
import { useCan, useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Notice, Skeleton } from '@/components/ui/misc';
import { StatusBadge } from './status-badge';
import { RequestActions } from './request-actions';
import { SlotPicker } from './booking-wizard';
import Link from 'next/link';

type Mode = 'view' | 'cancel' | 'reschedule';

export function AppointmentPanel({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!id} onOpenChange={onOpenChange}>
      <DialogContent side title="Detalle de la cita">
        {id && <PanelBody id={id} />}
      </DialogContent>
    </Dialog>
  );
}

function PanelBody({ id }: { id: string }) {
  const qc = useQueryClient();
  const user = useSession();
  const canWaitlist = useCan('lista_espera.gestionar');
  const appt = useAppointment(id);
  const events = useAppointmentEvents(id);
  const [mode, setMode] = useState<Mode>('view');
  const [error, setError] = useState<string | null>(null);

  const refresh = (a?: AppointmentView) => {
    if (a) qc.setQueryData(['appointments', 'one', id], a);
    void qc.invalidateQueries({ queryKey: ['appointments'] });
    void qc.invalidateQueries({ queryKey: ['availability'] });
  };

  const restore = useMutation({
    mutationFn: () => api<AppointmentView>(`/appointments/${id}/restore`, { method: 'POST' }),
    onSuccess: (a) => {
      refresh(a);
      toast.success('Listo: la cita volvió a quedar agendada.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const status = useMutation({
    mutationFn: (s: 'ATTENDED' | 'NO_SHOW') => api<AppointmentView>(`/appointments/${id}/status`, { method: 'PATCH', body: { status: s } }),
    onSuccess: (a) => (refresh(a), toast.success(a.status === 'ATTENDED' ? 'Marcada como atendida.' : 'Marcada como "no asistió".')),
    onError: (e) => setError(errorMessage(e)),
  });

  if (appt.isPending) return <Skeleton className="h-64" />;
  if (appt.isError)
    return (
      <Notice tone="danger" title="No se pudo abrir la cita">
        {errorMessage(appt.error)}
      </Notice>
    );
  const a = appt.data;
  const isFuture = new Date(a.startsAt).getTime() > Date.now();
  const canMark = a.status === 'SCHEDULED' && new Date(a.startsAt).getTime() <= Date.now() + 15 * 60_000;
  const canNote = user.permissions.includes('citas.notas') && (user.role === 'ADMIN' || (user.role === 'MEDICO' && user.doctorId === a.doctor.id));
  // El médico de la cita, cuando ya llegó la hora, va directo a registrar la consulta en la ficha.
  const canConsult =
    user.permissions.includes('fichas.editar') && user.doctorId === a.doctor.id && ['SCHEDULED', 'ATTENDED', 'NO_SHOW'].includes(a.status) && new Date(a.startsAt).getTime() <= Date.now() + 3600_000;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={a.status} />
          <span className="font-mono text-sm text-ink-3">{a.code}</span>
        </div>
        <p className="text-2xl font-bold first-letter:uppercase">
          {longDate(a.startsAt)}, <span className="font-mono">{time(a.startsAt)}</span>
        </p>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
          <dt className="text-ink-3">Paciente</dt>
          <dd className="font-bold">
            <Link className="underline decoration-rule-strong underline-offset-4 hover:text-ballpoint" href={`/pacientes/${a.patient.id}`}>
              {a.patient.fullName}
            </Link>{' '}
            <span className="font-normal text-ink-2">({a.patient.age} años)</span>
          </dd>
          <dt className="text-ink-3">Teléfono</dt>
          <dd className="font-mono">{phone(a.patient.phone)}</dd>
          <dt className="text-ink-3">Médico</dt>
          <dd>
            {a.doctor.fullName} · <span className="text-ink-2">{a.doctor.specialty}</span>
          </dd>
          <dt className="text-ink-3">Clínica</dt>
          <dd>{a.clinic.name}</dd>
          {a.reason && (
            <>
              <dt className="text-ink-3">Motivo</dt>
              <dd>{a.reason}</dd>
            </>
          )}
          {a.status === 'CANCELLED' && (
            <>
              <dt className="text-ink-3">Cancelada</dt>
              <dd>
                {a.cancelReason && CANCEL_REASON_LABELS[a.cancelReason]}
                {a.cancelNote && ` — ${a.cancelNote}`}
                <span className="block text-sm text-ink-3">
                  {a.cancelledBy ?? 'Alguien'} · {a.cancelledAt && dateTime(a.cancelledAt)}
                </span>
              </dd>
            </>
          )}
        </dl>
      </section>

      {error && <Notice tone="danger">{error}</Notice>}

      {a.status === 'REQUESTED' && (
        <Notice tone="warn" title="El paciente pidió esta cita en línea">
          <p className="mb-3">El horario ya está reservado. Acéptela para confirmarla, o recházela con una nota para el paciente.</p>
          <RequestActions appt={a} onDone={refresh} />
        </Notice>
      )}

      {mode === 'view' && (
        <section className="flex flex-wrap gap-2">
          {(a.status === 'SCHEDULED' || a.status === 'REQUESTED') && isFuture && (
            <>
              <Button variant="secondary" onClick={() => setMode('reschedule')}>
                <CalendarClock /> Cambiar día u hora
              </Button>
              <Button variant="danger" onClick={() => setMode('cancel')}>
                <XCircle /> Cancelar cita
              </Button>
            </>
          )}
          {canMark && (
            <>
              <Button onClick={() => status.mutate('ATTENDED')} disabled={status.isPending}>
                <CheckCircle2 /> Fue atendido
              </Button>
              <Button variant="secondary" onClick={() => status.mutate('NO_SHOW')} disabled={status.isPending}>
                <UserX /> No vino
              </Button>
            </>
          )}
          {a.status === 'CANCELLED' && a.canUndoCancel && (
            <Button onClick={() => restore.mutate()} disabled={restore.isPending}>
              <Undo2 /> Deshacer cancelación
            </Button>
          )}
        </section>
      )}

      {mode === 'cancel' && (
        <CancelForm
          appt={a}
          onCancel={() => setMode('view')}
          onDone={(res) => {
            refresh(res.appointment);
            setMode('view');
            toast(res.alreadyCancelled ? 'Esta cita ya estaba cancelada; no se hizo ningún cambio.' : 'Cita cancelada. El horario quedó libre.', {
              description: res.waitlistMatches && canWaitlist ? `Hay ${res.waitlistMatches} paciente(s) en lista de espera para esta clínica.` : undefined,
              action: res.alreadyCancelled ? undefined : { label: 'Deshacer', onClick: () => restore.mutate() },
              duration: 12000,
            });
          }}
        />
      )}

      {mode === 'reschedule' && (
        <RescheduleForm appt={a} onCancel={() => setMode('view')} onDone={(n) => (refresh(n), setMode('view'), toast.success(`Cita cambiada al ${longDate(n.startsAt)} a las ${time(n.startsAt)}.`))} />
      )}

      {a.status === 'SCHEDULED' && isFuture && canWaitlist && <NotifyPatient appt={a} onChanged={refresh} />}

      {user.role !== 'RECEPCION' && (
        <Button asChild variant={canConsult ? 'primary' : 'secondary'} className="self-start">
          <Link href={`/pacientes/${a.patient.id}?vista=ficha${canConsult ? `&consulta=${a.id}` : ''}`}>
            <ClipboardList /> {canConsult ? 'Registrar consulta en la ficha' : 'Ver ficha médica'}
          </Link>
        </Button>
      )}
      {canNote && <ClinicalNote appt={a} onSaved={refresh} />}

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-bold">
          <History className="size-5" aria-hidden /> Historial de esta cita
        </h3>
        <ol className="flex flex-col gap-2 border-l-2 border-rule pl-4">
          {events.data?.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="font-bold">{e.summary}</span>
              <span className="block text-ink-3">
                {dateTime(e.at)} · {e.by ?? 'Sistema'}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

type StaffReason = (typeof STAFF_CANCEL_REASONS)[number];

function CancelForm({
  appt,
  onCancel,
  onDone,
}: {
  appt: AppointmentView;
  onCancel: () => void;
  onDone: (r: { appointment: AppointmentView; alreadyCancelled: boolean; waitlistMatches: number }) => void;
}) {
  const [reason, setReason] = useState<StaffReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: () =>
      api<{ appointment: AppointmentView; alreadyCancelled: boolean; waitlistMatches: number }>(`/appointments/${appt.id}/cancel`, { method: 'POST', body: { reason, note: note || null } }),
    onSuccess: onDone,
    onError: async (e) => {
      if (e instanceof OfflineError && reason) {
        // Sin internet: la cancelación se guarda en este equipo y se envía sola al volver la conexión.
        await enqueue({
          key: newKey(),
          kind: 'cancel',
          appointmentId: appt.id,
          cancel: { reason, note: note || null },
          summary: `Cancelar ${appt.code}: ${appt.patient.fullName}, ${time(appt.startsAt)}`,
        });
        toast.warning('Sin internet: la cancelación quedó guardada en este equipo y se enviará sola cuando vuelva la conexión.', { duration: 15000 });
        onCancel();
        return;
      }
      setError(errorMessage(e));
    },
  });
  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-redpen/40 bg-redpen-soft/50 p-4">
      <h3 className="font-bold">¿Por qué se cancela la cita de {appt.patient.fullName}?</h3>
      <div role="radiogroup" aria-label="Motivo" className="flex flex-col gap-2">
        {STAFF_CANCEL_REASONS.map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md bg-surface px-3">
            <input type="radio" name="cancel-reason" className="size-5 accent-[var(--redpen)]" checked={reason === r} onChange={() => setReason(r)} />
            {CANCEL_REASON_LABELS[r]}
          </label>
        ))}
      </div>
      {reason === 'OTRO' && (
        <Field id="cancel-note" label="Escriba el motivo">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <p className="text-sm text-ink-2">La cita no se borra: queda registrada como cancelada y se puede deshacer mientras el horario siga libre.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" disabled={!reason || cancel.isPending} onClick={() => cancel.mutate()}>
          <XCircle /> Sí, cancelar la cita
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          No, volver
        </Button>
      </div>
    </section>
  );
}

function RescheduleForm({ appt, onCancel, onDone }: { appt: AppointmentView; onCancel: () => void; onDone: (a: AppointmentView) => void }) {
  const [date, setDate] = useState(appt.startsAt.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const move = useMutation({
    mutationFn: (s: AvailabilitySlot) => api<AppointmentView>(`/appointments/${appt.id}/reschedule`, { method: 'PATCH', body: { startsAt: s.startsAt, doctorId: s.doctorId } }),
    onSuccess: onDone,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-ballpoint/40 bg-ballpoint-soft/40 p-4">
      <h3 className="font-bold">Elija el nuevo día y hora (misma clínica)</h3>
      <Field id="reschedule-date" label="Día">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <SlotPicker clinicId={appt.clinic.id} date={date} selected={null} onSelect={(s) => move.mutate(s)} />
      <Button variant="secondary" onClick={onCancel}>
        No cambiar
      </Button>
    </section>
  );
}

function ClinicalNote({ appt, onSaved }: { appt: AppointmentView; onSaved: (a: AppointmentView) => void }) {
  const [value, setValue] = useState(appt.clinicalNote ?? '');
  const save = useMutation({
    mutationFn: () => api<AppointmentView>(`/appointments/${appt.id}/clinical-note`, { method: 'PATCH', body: { clinicalNote: value || null } }),
    onSuccess: (a) => (onSaved(a), toast.success('Nota clínica guardada.')),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="flex flex-col gap-2">
      <Field id="clinical-note" label="Nota clínica" hint="Solo la ven usted y la dirección. Recepción no tiene acceso.">
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={4} />
      </Field>
      <Button variant="secondary" className="self-start" onClick={() => save.mutate()} disabled={save.isPending}>
        <NotebookPen /> Guardar nota
      </Button>
    </section>
  );
}

/** Avisar al paciente: confirmación o recordatorio por WhatsApp con su enlace para cancelar, o un comprobante impreso. */
function NotifyPatient({ appt, onChanged }: { appt: AppointmentView; onChanged: (a: AppointmentView) => void }) {
  const reminded = useMutation({
    mutationFn: (value: boolean) => api<AppointmentView>(`/appointments/${appt.id}/reminded`, { method: 'PATCH', body: { reminded: value } }),
    onSuccess: onChanged,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(patientUrl(appt));
      toast.success('Enlace copiado. Péguelo en un mensaje para el paciente.');
    } catch {
      toast.message(patientUrl(appt));
    }
  };
  const soon = new Date(appt.startsAt).getTime() - Date.now() < 36 * 3600_000;
  return (
    <section className="flex flex-col gap-3 rounded-md border border-rule p-4">
      <h3 className="flex items-center gap-2 font-bold">
        <BellRing className="size-5" aria-hidden /> Avisar al paciente
      </h3>
      {appt.contactPhone ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={waLink(appt.contactPhone, soon ? reminderText(appt) : confirmationText(appt))} target="_blank" rel="noreferrer" onClick={() => soon && !appt.remindedAt && reminded.mutate(true)}>
              <MessageCircle /> {soon ? 'Recordar por WhatsApp' : 'Enviar confirmación por WhatsApp'}
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void copy()}>
            <Copy /> Copiar enlace del paciente
          </Button>
        </div>
      ) : (
        <p className="text-ink-2">Sin teléfono. {appt.contactNote ? `Cómo ubicarlo: ${appt.contactNote}` : ''}</p>
      )}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => window.open(`/comprobante/${appt.id}`, '_blank')}>
        <Printer /> Imprimir comprobante (con enlace para cancelar)
      </Button>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-6 accent-[var(--ballpoint)]" checked={!!appt.remindedAt} onChange={(e) => reminded.mutate(e.target.checked)} />
        <span>
          Ya se le recordó la cita
          {appt.remindedAt && (
            <span className="block text-sm text-ink-3">
              {appt.remindedBy ?? 'Alguien'} · {dateTime(appt.remindedAt)}
            </span>
          )}
        </span>
      </label>
    </section>
  );
}
