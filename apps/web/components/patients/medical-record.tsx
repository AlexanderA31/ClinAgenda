'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ClipboardPlus, HeartPulse, Pencil, ShieldCheck, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import {
  BLOOD_TYPES,
  CONSULTATION_EDIT_HOURS,
  MEDICAL_HISTORY_FIELDS,
  bodyMassIndex,
  type AppointmentView,
  type ConsultationView,
  type MedicalHistoryView,
  type MedicalRecordView,
} from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { dateTime, longDate, shortDate, time } from '@/lib/format';
import { useAppointments } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';

const num = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1, useGrouping: false });

export function useMedicalRecord(patientId: string) {
  return useQuery({ queryKey: ['medical-record', patientId], queryFn: () => api<MedicalRecordView>(`/patients/${patientId}/medical-record`) });
}

/**
 * Ficha médica del paciente: alergias siempre arriba, antecedentes a la izquierda y consultas
 * (la más reciente primero) a la derecha. `openForAppointment` abre "Registrar consulta" ya ligada
 * a esa cita (viene del panel de la cita en la agenda).
 */
export function MedicalRecord({ patientId, openForAppointment, onOpened }: { patientId: string; openForAppointment?: string | null; onOpened?: () => void }) {
  const record = useMedicalRecord(patientId);
  const [editingHistory, setEditingHistory] = useState(false);
  const [consultation, setConsultation] = useState<{ edit?: ConsultationView; appointmentId?: string } | null>(null);

  // Llegó desde la cita: se abre una sola vez, salvo que esa cita ya tenga su consulta.
  const data = record.data;
  useEffect(() => {
    if (!openForAppointment || !data) return;
    if (data.consultations.some((c) => c.appointment?.id === openForAppointment)) toast.message('Esa cita ya tiene su consulta registrada: está en la lista.');
    else if (data.canWriteConsultation) setConsultation({ appointmentId: openForAppointment });
    onOpened?.();
  }, [openForAppointment, data, onOpened]);

  if (record.isPending) return <Skeleton className="h-96" />;
  if (record.isError)
    return (
      <Notice tone="danger" title="No se pudo abrir la ficha médica">
        {errorMessage(record.error)}
      </Notice>
    );
  const r = record.data;

  return (
    <div className="flex flex-col gap-6">
      <AllergyBanner allergies={r.history.allergies} />
      <div className="grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Antecedentes</CardTitle>
            {r.canEditHistory && (
              <Button variant="secondary" size="sm" onClick={() => setEditingHistory(true)}>
                <Pencil /> Editar
              </Button>
            )}
          </CardHeader>
          <CardBody>
            <History history={r.history} />
          </CardBody>
        </Card>

        <section aria-labelledby="consultas-titulo" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="consultas-titulo" className="text-xl font-extrabold">
              Consultas <span className="font-normal text-ink-3">({r.consultations.length})</span>
            </h2>
            {r.canWriteConsultation && (
              <Button onClick={() => setConsultation({})}>
                <ClipboardPlus /> Registrar consulta
              </Button>
            )}
          </div>
          {r.canEditHistory && !r.canWriteConsultation && (
            <Notice tone="info">Para registrar consultas, su usuario debe estar vinculado a una ficha de médico. Puede corregir los antecedentes.</Notice>
          )}
          {r.consultations.length ? (
            <ol className="flex flex-col gap-4">
              {r.consultations.map((c) => (
                <li key={c.id}>
                  <ConsultationCard c={c} onEdit={() => setConsultation({ edit: c })} />
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Todavía sin consultas registradas">Cada atención queda aquí con sus signos vitales, diagnóstico y plan.</EmptyState>
          )}
        </section>
      </div>

      <Dialog open={editingHistory} onOpenChange={setEditingHistory}>
        <DialogContent side title="Antecedentes" description="Lo ven los médicos del paciente y la dirección. Recepción no tiene acceso.">
          {editingHistory && <HistoryForm patientId={patientId} history={r.history} onDone={() => setEditingHistory(false)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!consultation} onOpenChange={(o) => !o && setConsultation(null)}>
        <DialogContent
          side
          title={consultation?.edit ? 'Corregir consulta' : 'Registrar consulta'}
          description={consultation?.edit ? `Puede corregirla durante las primeras ${CONSULTATION_EDIT_HOURS} horas.` : 'Solo el motivo es obligatorio. Las medidas aceptan coma o punto decimal.'}
        >
          {consultation && <ConsultationForm patientId={patientId} record={r} edit={consultation.edit} presetAppointmentId={consultation.appointmentId} onDone={() => setConsultation(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Lo primero que debe ver quien abre la ficha: si el paciente es alérgico a algo. */
function AllergyBanner({ allergies }: { allergies: string | null }) {
  if (!allergies) {
    return (
      <Notice tone="warn" title="Alergias sin registrar">
        Pregunte al paciente y anótelas en los antecedentes, aunque sea "Ninguna conocida".
      </Notice>
    );
  }
  if (/^ningun[ao]?\b/i.test(allergies)) {
    return (
      <p className="flex items-center gap-2 font-bold text-good">
        <ShieldCheck className="size-5" aria-hidden /> Sin alergias conocidas
      </p>
    );
  }
  return (
    <div role="alert" className="flex gap-3 rounded-md border-2 border-redpen bg-redpen-soft px-4 py-3 text-redpen">
      <AlertTriangle className="mt-0.5 size-6 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-extrabold">Alergias</p>
        <p className="whitespace-pre-line font-bold text-ink">{allergies}</p>
      </div>
    </div>
  );
}

function History({ history: h }: { history: MedicalHistoryView }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-4">
        <div>
          <dt className="text-sm font-bold text-ink-3">Grupo sanguíneo</dt>
          <dd className={h.bloodType ? 'font-mono text-lg font-bold' : 'text-ink-3'}>{h.bloodType ?? 'Sin registrar'}</dd>
        </div>
        {MEDICAL_HISTORY_FIELDS.filter((f) => f.key !== 'allergies').map((f) => (
          <div key={f.key}>
            <dt className="text-sm font-bold text-ink-3">{f.label}</dt>
            <dd className={h[f.key] ? 'whitespace-pre-line break-words' : 'text-ink-3'}>{h[f.key] ?? 'Sin registrar'}</dd>
          </div>
        ))}
      </dl>
      {h.updatedAt && (
        <p className="border-t border-rule pt-3 text-sm text-ink-3">
          Actualizado por {h.updatedBy ?? 'alguien'} · {dateTime(h.updatedAt)}
        </p>
      )}
    </div>
  );
}

function vitalsOf(c: Pick<ConsultationView, 'weightKg' | 'heightCm' | 'bmi' | 'systolic' | 'diastolic' | 'heartRate' | 'temperatureC' | 'oxygenSat'>) {
  const list: { label: string; value: string; unit: string; title: string }[] = [];
  if (c.systolic != null && c.diastolic != null) list.push({ label: 'PA', value: `${c.systolic}/${c.diastolic}`, unit: 'mmHg', title: 'Presión arterial' });
  if (c.heartRate != null) list.push({ label: 'FC', value: String(c.heartRate), unit: 'lpm', title: 'Frecuencia cardiaca' });
  if (c.temperatureC != null) list.push({ label: 'T', value: num.format(c.temperatureC), unit: '°C', title: 'Temperatura' });
  if (c.oxygenSat != null) list.push({ label: 'SpO₂', value: String(c.oxygenSat), unit: '%', title: 'Saturación de oxígeno' });
  if (c.weightKg != null) list.push({ label: 'Peso', value: num.format(c.weightKg), unit: 'kg', title: 'Peso' });
  if (c.heightCm != null) list.push({ label: 'Talla', value: num.format(c.heightCm), unit: 'cm', title: 'Talla' });
  if (c.bmi != null) list.push({ label: 'IMC', value: num.format(c.bmi), unit: '', title: 'Índice de masa corporal' });
  return list;
}

function ConsultationCard({ c, onEdit }: { c: ConsultationView; onEdit: () => void }) {
  const when = c.appointment?.startsAt ?? c.createdAt;
  const vitals = vitalsOf(c);
  const sections = (
    [
      ['Examen y evolución', c.findings],
      ['Diagnóstico', c.diagnosis],
      ['Plan e indicaciones', c.plan],
    ] as const
  ).filter(([, v]) => v);
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-3">
            <time dateTime={when} className="font-bold text-ink-2 first-letter:uppercase">
              {longDate(when)}
            </time>{' '}
            · {time(when)}
            {c.appointment && (
              <>
                {' '}
                · {c.appointment.clinic} · <span className="whitespace-nowrap font-mono">{c.appointment.code}</span>
              </>
            )}
          </p>
          <h3 className="mt-1 text-lg font-extrabold">{c.reason}</h3>
          <p className="flex items-center gap-1.5 text-sm text-ink-2">
            <Stethoscope className="size-4" aria-hidden /> {c.doctor.fullName} · {c.doctor.specialty}
          </p>
        </div>
        {c.editable && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="shrink-0">
            <Pencil /> Corregir
          </Button>
        )}
      </header>
      {vitals.length > 0 && (
        <dl className="flex flex-wrap gap-2" aria-label="Signos vitales">
          {vitals.map((v) => (
            <div key={v.label} title={v.title} className="flex items-baseline gap-1.5 rounded-md bg-surface-2 px-3 py-1.5">
              <dt className="text-sm font-bold text-ink-3">{v.label}</dt>
              <dd className="tabular font-mono font-bold">
                {v.value}
                {v.unit && <span className="ml-0.5 text-sm font-normal text-ink-3">{v.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {sections.map(([label, value]) => (
        <section key={label}>
          <h4 className="text-sm font-bold text-ink-3">{label}</h4>
          <p className={label === 'Diagnóstico' ? 'whitespace-pre-line font-bold' : 'whitespace-pre-line break-words'}>{value}</p>
        </section>
      ))}
      {!c.appointment && <p className="text-sm text-ink-3">Registrada sin cita · {dateTime(c.createdAt)}</p>}
    </article>
  );
}

function HistoryForm({ patientId, history, onDone }: { patientId: string; history: MedicalHistoryView; onDone: () => void }) {
  const qc = useQueryClient();
  const [values, setValues] = useState(
    () =>
      ({ bloodType: history.bloodType ?? '', ...Object.fromEntries(MEDICAL_HISTORY_FIELDS.map((f) => [f.key, history[f.key] ?? ''])) }) as Record<
        'bloodType' | (typeof MEDICAL_HISTORY_FIELDS)[number]['key'],
        string
      >,
  );
  const save = useMutation({
    mutationFn: () => api<MedicalRecordView>(`/patients/${patientId}/medical-record`, { method: 'PUT', body: { ...values, bloodType: values.bloodType || null } }),
    onSuccess: (r) => (qc.setQueryData(['medical-record', patientId], r), toast.success('Antecedentes guardados.'), onDone()),
  });
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {};

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      {save.isError && !Object.keys(fields).length && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
      <Field id="mr-blood" label="Grupo sanguíneo" optional error={fields.bloodType}>
        <Select value={values.bloodType} onChange={(e) => setValues({ ...values, bloodType: e.target.value })} className="max-w-48">
          <option value="">Sin registrar</option>
          {BLOOD_TYPES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </Field>
      {MEDICAL_HISTORY_FIELDS.map((f) => (
        <Field key={f.key} id={`mr-${f.key}`} label={f.label} hint={f.hint} error={fields[f.key]} optional>
          <Textarea rows={f.key === 'allergies' || f.key === 'medications' ? 3 : 2} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
        </Field>
      ))}
      <Button type="submit" size="lg" disabled={save.isPending}>
        {save.isPending ? 'Guardando…' : 'Guardar antecedentes'}
      </Button>
    </form>
  );
}

const VITAL_INPUTS = [
  { key: 'systolic', label: 'Presión sistólica', unit: 'mmHg', placeholder: '120' },
  { key: 'diastolic', label: 'Presión diastólica', unit: 'mmHg', placeholder: '80' },
  { key: 'heartRate', label: 'Frecuencia cardiaca', unit: 'lpm', placeholder: '72' },
  { key: 'temperatureC', label: 'Temperatura', unit: '°C', placeholder: '36,5' },
  { key: 'oxygenSat', label: 'Saturación', unit: '%', placeholder: '97' },
  { key: 'weightKg', label: 'Peso', unit: 'kg', placeholder: '70,5' },
  { key: 'heightCm', label: 'Talla', unit: 'cm', placeholder: '165' },
] as const;
type VitalKey = (typeof VITAL_INPUTS)[number]['key'];
type TextKey = 'reason' | 'findings' | 'diagnosis' | 'plan';

const toNumber = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);

/** La consulta de una cita solo se registra si la cita ya llegó, no se canceló y aún no tiene consulta. */
function eligible(a: AppointmentView, taken: Set<string>) {
  return (a.status === 'SCHEDULED' || a.status === 'ATTENDED' || a.status === 'NO_SHOW') && new Date(a.startsAt).getTime() <= Date.now() + 3600_000 && !taken.has(a.id);
}

function ConsultationForm({
  patientId,
  record,
  edit,
  presetAppointmentId,
  onDone,
}: {
  patientId: string;
  record: MedicalRecordView;
  edit?: ConsultationView;
  presetAppointmentId?: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const user = useSession();
  const appts = useAppointments({ patientId, doctorId: user.doctorId ?? undefined, pageSize: 50, sortBy: 'startsAt', sortDir: 'desc' }, !edit && !!user.doctorId);
  const options = useMemo(() => {
    const taken = new Set(record.consultations.flatMap((c) => (c.appointment ? [c.appointment.id] : [])));
    return (appts.data?.items ?? []).filter((a) => eligible(a, taken));
  }, [appts.data, record.consultations]);

  const [appointmentId, setAppointmentId] = useState<string | null>(presetAppointmentId ?? null);
  // Sin cita elegida todavía: se propone la de hoy, que es lo más común.
  const chosen = appointmentId ?? (appts.isSuccess && options[0] && shortDate(options[0].startsAt) === shortDate(new Date()) ? options[0].id : '');
  const [text, setText] = useState<Record<TextKey, string>>({ reason: edit?.reason ?? '', findings: edit?.findings ?? '', diagnosis: edit?.diagnosis ?? '', plan: edit?.plan ?? '' });
  const [vitals, setVitals] = useState<Record<VitalKey, string>>(
    () => Object.fromEntries(VITAL_INPUTS.map((v) => [v.key, edit?.[v.key] != null ? num.format(edit[v.key]!) : ''])) as Record<VitalKey, string>,
  );
  const bmi = bodyMassIndex(toNumber(vitals.weightKg), toNumber(vitals.heightCm));
  const reasonFromAppt = options.find((a) => a.id === chosen)?.reason;

  const save = useMutation({
    mutationFn: () => {
      const body = { ...text, reason: text.reason || reasonFromAppt || '', ...vitals };
      return edit
        ? api<ConsultationView>(`/patients/${patientId}/consultations/${edit.id}`, { method: 'PUT', body })
        : api<ConsultationView>(`/patients/${patientId}/consultations`, { method: 'POST', body: { ...body, appointmentId: chosen || null } });
    },
    onSuccess: async () => {
      toast.success(edit ? 'Consulta corregida.' : 'Consulta registrada en la ficha.');
      await qc.invalidateQueries({ queryKey: ['medical-record', patientId] });
      onDone();
    },
  });
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {};
  const vitalErrors = VITAL_INPUTS.flatMap((v) => (fields[v.key] ? [fields[v.key]] : []));

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      {save.isError && !Object.keys(fields).length && <Notice tone="danger">{errorMessage(save.error)}</Notice>}

      {edit ? (
        edit.appointment && (
          <p className="text-ink-2">
            Cita <span className="font-mono">{edit.appointment.code}</span> · {shortDate(edit.appointment.startsAt)} {time(edit.appointment.startsAt)} · {edit.appointment.clinic}
          </p>
        )
      ) : (
        <Field id="cs-appt" label="Cita en la que lo atendió" hint="Solo aparecen sus citas de este paciente que ya llegaron." error={fields.appointmentId}>
          <Select value={chosen} onChange={(e) => setAppointmentId(e.target.value)} disabled={appts.isPending}>
            <option value="">Sin cita (atención fuera de agenda)</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {shortDate(a.startsAt)} {time(a.startsAt)} · {a.clinic.name} · {a.code}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field id="cs-reason" label="Motivo de consulta" error={fields.reason} hint={!text.reason && reasonFromAppt ? `Si lo deja vacío se usa el de la cita: "${reasonFromAppt}".` : undefined}>
        <Input value={text.reason} onChange={(e) => setText({ ...text, reason: e.target.value })} placeholder={reasonFromAppt ?? 'Ej. control de presión, dolor de garganta'} />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-rule p-4">
        <legend className="flex items-center gap-2 px-1 font-bold">
          <HeartPulse className="size-5 text-redpen" aria-hidden /> Signos vitales <span className="font-normal text-ink-3">(opcionales)</span>
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {VITAL_INPUTS.map((v) => (
            <label key={v.key} className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-bold">{v.label}</span>
              <span className="relative">
                <Input
                  inputMode="decimal"
                  value={vitals[v.key]}
                  onChange={(e) => setVitals({ ...vitals, [v.key]: e.target.value })}
                  placeholder={v.placeholder}
                  aria-invalid={fields[v.key] ? true : undefined}
                  className="pr-14 font-mono"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">{v.unit}</span>
              </span>
            </label>
          ))}
          <div className="flex flex-col justify-end gap-1">
            <span className="text-sm font-bold text-ink-3">IMC</span>
            <output className="flex min-h-12 items-center font-mono text-lg font-bold">{bmi != null ? num.format(bmi) : '—'}</output>
          </div>
        </div>
        {vitalErrors.map((err) => (
          <p key={err} role="alert" className="text-sm font-bold text-redpen">
            {err}
          </p>
        ))}
      </fieldset>

      <Field id="cs-findings" label="Examen físico y evolución" optional error={fields.findings}>
        <Textarea rows={4} value={text.findings} onChange={(e) => setText({ ...text, findings: e.target.value })} />
      </Field>
      <Field id="cs-diagnosis" label="Diagnóstico" optional error={fields.diagnosis}>
        <Textarea rows={2} value={text.diagnosis} onChange={(e) => setText({ ...text, diagnosis: e.target.value })} />
      </Field>
      <Field id="cs-plan" label="Plan e indicaciones" hint="Tratamiento, exámenes pedidos, próximo control." optional error={fields.plan}>
        <Textarea rows={4} value={text.plan} onChange={(e) => setText({ ...text, plan: e.target.value })} />
      </Field>

      <Button type="submit" size="lg" disabled={save.isPending}>
        <ClipboardPlus /> {save.isPending ? 'Guardando…' : edit ? 'Guardar corrección' : 'Registrar consulta'}
      </Button>
    </form>
  );
}
