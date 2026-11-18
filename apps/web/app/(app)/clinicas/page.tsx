'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarX, Clock, Copy, MapPin, Pencil, Phone, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { WEEKDAY_LABELS, type ClinicView, type OrphanAppointment, type WeeklySlot } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { dateTime, dayLabel, phone as formatPhone, todayIso } from '@/lib/format';
import { useClinics } from '@/lib/queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Notice, PageHeader, Skeleton } from '@/components/ui/misc';

/** Lunes primero, domingo al final: como se lee una semana de trabajo. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const SLOT_OPTIONS = [10, 15, 20, 30, 45, 60];

export default function ClinicsPage() {
  const clinics = useClinics();
  const [editing, setEditing] = useState<ClinicView | null>(null);
  const [orphans, setOrphans] = useState<{ clinic: string; items: OrphanAppointment[] } | null>(null);
  return (
    <>
      <PageHeader
        title="Clínicas"
        description="Cada clínica tiene su propio horario. Los días cerrados (feriados) no permiten agendar. Un cambio de horario nunca cancela citas: le mostramos cuáles hay que mover."
      />
      {orphans && orphans.items.length > 0 && (
        <Notice tone="warn" title={`${orphans.items.length} cita(s) de ${orphans.clinic} quedaron fuera del nuevo horario`}>
          <p>No se cancelaron. Llame a estos pacientes para cambiarles la hora:</p>
          <ul className="mt-2 flex flex-col gap-1">
            {orphans.items.map((o) => (
              <li key={o.id} className="tabular">
                <strong>{o.code}</strong> · {dateTime(o.startsAt)} · {o.patientName} ({o.doctorName}) · {o.patientPhone ? formatPhone(o.patientPhone) : 'sin teléfono'}
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOrphans(null)}>
            <X /> Entendido
          </Button>
        </Notice>
      )}
      {clinics.isPending ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="grid auto-rows-fr gap-4 lg:grid-cols-3">
          {clinics.data?.map((c) => (
            <ClinicCard key={c.id} clinic={c} onEdit={() => setEditing(c)} />
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent side title={`Editar ${editing?.name ?? ''}`} description="Los cambios se aplican desde ahora para dar citas nuevas.">
          {editing && (
            <ClinicEditor
              clinic={editing}
              onSaved={(items) => {
                setEditing(null);
                setOrphans(items.length ? { clinic: editing.name, items } : null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClinicCard({ clinic, onEdit }: { clinic: ClinicView; onEdit: () => void }) {
  const canEdit = useCan('clinicas.gestionar');
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const close = useMutation({
    mutationFn: () => api<{ appointmentsToReschedule: number }>(`/clinics/${clinic.id}/closures`, { method: 'POST', body: { date, reason } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['clinics'] });
      setDate('');
      setReason('');
      toast.success(r.appointmentsToReschedule ? `Día cerrado. Hay ${r.appointmentsToReschedule} cita(s) ese día: llame a esos pacientes para cambiarlas.` : 'Día cerrado. No había citas ese día.', {
        duration: 15000,
      });
    },
  });
  const reopen = useMutation({
    mutationFn: (closureId: string) => api(`/clinics/${clinic.id}/closures/${closureId}`, { method: 'DELETE' }),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['clinics'] }), toast.success('Cierre quitado: ese día se vuelve a poder agendar.')),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="font-display text-2xl">{clinic.name}</CardTitle>
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil /> Editar
            </Button>
          )}
        </div>
        <p className="flex items-start gap-2 text-ink-2">
          <MapPin className="mt-1 size-4 shrink-0" aria-hidden /> {clinic.address ?? 'Sin dirección'}
        </p>
        <p className="flex items-center gap-2 text-ink-2">
          <Phone className="size-4 shrink-0" aria-hidden /> {clinic.phone ?? 'Sin teléfono'}
        </p>
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <Clock className="size-4 shrink-0" aria-hidden /> Turnos de {clinic.slotMinutes} minutos
        </p>
      </CardHeader>
      <CardBody className="flex flex-1 flex-col gap-4">
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-y-1">
          {WEEK.map((d) => {
            const s = clinic.schedule.filter((x) => x.weekday === d);
            return (
              <div key={d} className="contents">
                <dt className="text-ink-2">{WEEKDAY_LABELS[d]}</dt>
                <dd className="tabular">{s.length ? s.map((x) => `${x.startTime}–${x.endTime}`).join(' y ') : <span className="text-ink-3">Cerrado</span>}</dd>
              </div>
            );
          })}
        </dl>
        <div className="flex flex-col gap-1">
          <p className="font-bold">Próximos cierres</p>
          {clinic.closures.length ? (
            <ul className="flex flex-col gap-1">
              {clinic.closures.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-warn-soft px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="font-bold first-letter:uppercase">{dayLabel(c.date)}</span>: {c.reason}
                  </span>
                  {canEdit && (
                    <Button variant="ghost" size="sm" className="shrink-0" disabled={reopen.isPending} onClick={() => reopen.mutate(c.id)} aria-label={`Quitar el cierre del ${dayLabel(c.date)}`}>
                      <Trash2 /> Quitar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3">Ninguno.</p>
          )}
        </div>
        {canEdit && (
          <form
            className="mt-auto flex flex-col gap-3 border-t border-rule pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              close.mutate();
            }}
          >
            <p className="font-bold">Cerrar un día</p>
            {close.isError && <Notice tone="danger">{errorMessage(close.error)}</Notice>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field id={`closure-date-${clinic.id}`} label="Fecha">
                <Input type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field id={`closure-reason-${clinic.id}`} label="Motivo">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Feriado…" />
              </Field>
            </div>
            <Button type="submit" variant="secondary" disabled={!date || reason.length < 3 || close.isPending}>
              <CalendarX /> Cerrar ese día
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

type DayRanges = Record<number, { startTime: string; endTime: string }[]>;

function toDays(schedule: WeeklySlot[]): DayRanges {
  const days: DayRanges = Object.fromEntries(WEEK.map((d) => [d, []]));
  for (const s of schedule) days[s.weekday].push({ startTime: s.startTime, endTime: s.endTime });
  for (const d of WEEK) days[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
  return days;
}

/** Editor del horario semanal: varios rangos por día (para el corte del almuerzo) y datos de contacto. */
function ClinicEditor({ clinic, onSaved }: { clinic: ClinicView; onSaved: (orphans: OrphanAppointment[]) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: clinic.name, address: clinic.address ?? '', phone: clinic.phone ?? '', slotMinutes: clinic.slotMinutes });
  const [days, setDays] = useState<DayRanges>(() => toDays(clinic.schedule));
  const [fields, setFields] = useState<Record<string, string>>({});

  const schedule: WeeklySlot[] = WEEK.flatMap((d) => days[d].map((r) => ({ weekday: d, ...r })));
  const save = useMutation({
    mutationFn: () =>
      api<ClinicView & { appointmentsOutsideSchedule: OrphanAppointment[] }>(`/clinics/${clinic.id}`, {
        method: 'PATCH',
        body: { name: form.name, address: form.address || null, phone: form.phone || null, slotMinutes: form.slotMinutes, schedule },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['clinics'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      toast.success('Horario guardado.');
      onSaved(r.appointmentsOutsideSchedule);
    },
    onError: (e) => setFields(e instanceof ApiRequestError ? e.fields : {}),
  });

  const setRange = (d: number, i: number, key: 'startTime' | 'endTime', value: string) => setDays((prev) => ({ ...prev, [d]: prev[d].map((r, j) => (j === i ? { ...r, [key]: value } : r)) }));
  const toggleDay = (d: number) => setDays((prev) => ({ ...prev, [d]: prev[d].length ? [] : [{ startTime: '08:00', endTime: '17:00' }] }));
  const addRange = (d: number) =>
    setDays((prev) => {
      const last = prev[d].at(-1);
      return { ...prev, [d]: [...prev[d], { startTime: last ? last.endTime : '08:00', endTime: last ? '18:00' : '12:00' }] };
    });
  const removeRange = (d: number, i: number) => setDays((prev) => ({ ...prev, [d]: prev[d].filter((_, j) => j !== i) }));
  const copyMonday = () => setDays((prev) => ({ ...prev, 2: [...prev[1]], 3: [...prev[1]], 4: [...prev[1]], 5: [...prev[1]] }));

  // Errores del servidor llegan como "schedule.3": se ubican en el día y rango correspondiente.
  const rangeError = (d: number, i: number) => {
    const index = schedule.findIndex((s, k) => s.weekday === d && schedule.slice(0, k).filter((x) => x.weekday === d).length === i);
    return fields[`schedule.${index}`] ?? fields[`schedule.${index}.endTime`] ?? fields[`schedule.${index}.startTime`];
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      {save.isError && <Notice tone="danger">{errorMessage(save.error)}</Notice>}

      <section className="flex flex-col gap-4">
        <h3 className="font-display text-xl font-bold">Datos de la clínica</h3>
        <Field id="c-name" label="Nombre" error={fields.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field id="c-address" label="Dirección" optional error={fields.address}>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-phone" label="Teléfono" optional error={fields.phone}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
          </Field>
          <Field id="c-slot" label="Duración de cada turno" error={fields.slotMinutes}>
            <Select value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: Number(e.target.value) })}>
              {SLOT_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} minutos
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="font-display text-xl font-bold">Horario de atención</h3>
          <Button type="button" variant="link" size="sm" onClick={copyMonday} disabled={!days[1].length}>
            <Copy className="!size-4" /> Copiar el lunes a martes–viernes
          </Button>
        </div>
        {fields.schedule && <Notice tone="danger">{fields.schedule}</Notice>}
        <ul className="flex flex-col divide-y divide-rule rounded-md border border-rule">
          {WEEK.map((d) => {
            const open = days[d].length > 0;
            return (
              <li key={d} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{WEEKDAY_LABELS[d]}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={open}
                    aria-label={`${WEEKDAY_LABELS[d]}: ${open ? 'abierto' : 'cerrado'}`}
                    onClick={() => toggleDay(d)}
                    className={cn('flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-bold', open ? 'bg-good-soft text-good' : 'bg-surface-2 text-ink-3')}
                  >
                    <span className={cn('relative h-5 w-9 rounded-full', open ? 'bg-good' : 'bg-rule-strong')} aria-hidden>
                      <span className={cn('absolute top-0.5 size-4 rounded-full bg-surface transition-[left]', open ? 'left-[1.125rem]' : 'left-0.5')} />
                    </span>
                    {open ? 'Abierto' : 'Cerrado'}
                  </button>
                </div>
                {days[d].map((r, i) => {
                  const err = rangeError(d, i);
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          aria-label={`${WEEKDAY_LABELS[d]}, desde`}
                          className={cn('w-32', err && 'border-redpen')}
                          value={r.startTime}
                          step={300}
                          onChange={(e) => setRange(d, i, 'startTime', e.target.value)}
                        />
                        <span className="text-ink-3">a</span>
                        <Input
                          type="time"
                          aria-label={`${WEEKDAY_LABELS[d]}, hasta`}
                          className={cn('w-32', err && 'border-redpen')}
                          value={r.endTime}
                          step={300}
                          onChange={(e) => setRange(d, i, 'endTime', e.target.value)}
                        />
                        {days[d].length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Quitar este horario" onClick={() => removeRange(d, i)}>
                            <X />
                          </Button>
                        )}
                      </div>
                      {err && <p className="text-sm font-bold text-redpen">{err}</p>}
                    </div>
                  );
                })}
                {open && (
                  <Button type="button" variant="link" size="sm" className="w-fit" onClick={() => addRange(d)}>
                    <Plus className="!size-4" /> Agregar otro horario (p. ej. después del almuerzo)
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-ink-3">Recuerde revisar también el horario de cada médico en “Médicos”: un médico solo recibe citas dentro del horario de la clínica.</p>
      </section>

      <Button type="submit" size="lg" disabled={save.isPending || !schedule.length}>
        <Save /> Guardar horario
      </Button>
    </form>
  );
}
