'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarCheck, CalendarPlus, ChevronLeft, ChevronRight, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { AppointmentView, AvailabilitySlot, PatientView } from '@clinagenda/schemas';
import { ApiRequestError, OfflineError, api, errorMessage } from '@/lib/api';
import { addDays, dayLabel, phone, time, todayIso } from '@/lib/format';
import { enqueue, newKey } from '@/lib/offline-queue';
import { confirmationText, waLink } from '@/lib/whatsapp';
import { useAvailability, useClinics, useDebounced, usePatientSearch } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { PatientForm } from '@/components/forms/patient-form';
import { cn } from '@/lib/utils';

export interface BookingPreset {
  clinicId?: string;
  date?: string;
  slot?: AvailabilitySlot;
  patient?: PatientView;
  waitlistEntryId?: string;
}

const STEPS = ['Paciente', 'Día y hora', 'Confirmar'] as const;

/**
 * Agendar en tres pasos, uno por pantalla, con botones grandes y una frase final que se puede leer
 * en voz alta al paciente por teléfono antes de confirmar.
 */
export function BookingWizard({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (o: boolean) => void; preset?: BookingPreset }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side title="Nueva cita" description="Tres pasos: paciente, día y hora, confirmar.">
        {open && <WizardBody preset={preset} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function WizardBody({ preset, onDone }: { preset?: BookingPreset; onDone: () => void }) {
  const qc = useQueryClient();
  const clinics = useClinics();
  const [step, setStep] = useState(preset?.patient ? (preset.slot ? 2 : 1) : 0);
  const [patient, setPatient] = useState<PatientView | null>(preset?.patient ?? null);
  const [clinicId, setClinicId] = useState(preset?.clinicId ?? '');
  const [date, setDate] = useState(preset?.date ?? todayIso());
  const [slot, setSlot] = useState<AvailabilitySlot | null>(preset?.slot ?? null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Una clave por intento de agendar: si se reintenta (doble clic, internet que vuelve), no se duplica.
  const [idemKey] = useState(newKey);

  const clinic = clinics.data?.find((c) => c.id === (clinicId || clinics.data?.[0]?.id));
  const effectiveClinicId = clinic?.id;

  const book = useMutation({
    mutationFn: () =>
      api<AppointmentView>('/appointments', {
        method: 'POST',
        headers: { 'Idempotency-Key': idemKey },
        body: { patientId: patient!.id, doctorId: slot!.doctorId, clinicId: effectiveClinicId!, startsAt: slot!.startsAt, reason: reason || null, waitlistEntryId: preset?.waitlistEntryId ?? null },
      }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      void qc.invalidateQueries({ queryKey: ['waitlist'] });
      toast.success(`Cita confirmada (${a.code}): ${a.patient.fullName}, ${dayLabel(a.startsAt.slice(0, 10))} a las ${time(a.startsAt)}.`, {
        duration: 20000,
        // Un toque para mandarle al paciente la confirmación con su enlace para cancelar.
        action: a.contactPhone ? { label: 'Enviar por WhatsApp', onClick: () => window.open(waLink(a.contactPhone!, confirmationText(a)), '_blank') } : undefined,
      });
      onDone();
    },
    onError: async (e) => {
      if (e instanceof OfflineError) {
        await enqueue({
          key: idemKey,
          input: { patientId: patient!.id, doctorId: slot!.doctorId, clinicId: effectiveClinicId!, startsAt: slot!.startsAt, reason: reason || null },
          summary: `${patient!.fullName} · ${slot!.doctorName} · ${dayLabel(date)} ${slot!.label}`,
        });
        toast.warning('Sin internet: la cita quedó guardada en este equipo como PENDIENTE. Se enviará sola cuando vuelva la conexión. Avise al paciente que se la confirmará.', { duration: 15000 });
        onDone();
        return;
      }
      setError(errorMessage(e));
      if (e instanceof ApiRequestError && (e.code === 'SLOT_TAKEN' || e.code === 'OUTSIDE_SCHEDULE')) {
        void qc.invalidateQueries({ queryKey: ['availability'] });
        setSlot(null);
        setStep(1);
      }
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid grid-cols-3 gap-2" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? 'step' : undefined}
            className={cn('flex flex-col gap-1 border-t-4 pt-2 text-sm font-bold', i < step ? 'border-good text-good' : i === step ? 'border-ballpoint text-ink' : 'border-rule text-ink-3')}
          >
            <span className="tabular text-xs uppercase tracking-wider">Paso {i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {error && <Notice tone="danger" title="No se pudo agendar">{error}</Notice>}

      {step === 0 && (
        <PatientStep
          onPick={(p) => {
            setPatient(p);
            setStep(slot ? 2 : 1);
          }}
        />
      )}

      {step === 1 && patient && (
        <div className="flex flex-col gap-5">
          <SelectedPatient patient={patient} onChange={() => setStep(0)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="wizard-clinic" label="Clínica">
              <Select value={effectiveClinicId ?? ''} onChange={(e) => (setClinicId(e.target.value), setSlot(null))}>
                {clinics.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="wizard-date" label="Día">
              <Input type="date" min={todayIso()} value={date} onChange={(e) => (setDate(e.target.value), setSlot(null))} />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDate((d) => (d > todayIso() ? addDays(d, -1) : d))} disabled={date <= todayIso()}>
              <ChevronLeft /> Día anterior
            </Button>
            <p className="text-center font-bold first-letter:uppercase">{dayLabel(date)}</p>
            <Button variant="secondary" size="sm" onClick={() => setDate((d) => addDays(d, 1))}>
              Día siguiente <ChevronRight />
            </Button>
          </div>
          <SlotPicker clinicId={effectiveClinicId} date={date} selected={slot} onSelect={(s) => (setSlot(s), setStep(2))} />
        </div>
      )}

      {step === 2 && patient && slot && clinic && (
        <div className="flex flex-col gap-5">
          <div className="ruled rounded-lg border-2 border-ballpoint bg-surface px-5 py-4">
            <p className="text-sm font-bold uppercase tracking-wider text-ink-3">Lea esto al paciente antes de confirmar</p>
            <p className="mt-2 text-xl leading-relaxed">
              <strong>{patient.fullName}</strong>, con <strong>{slot.doctorName}</strong>, en <strong>{clinic.name}</strong>, el{' '}
              <strong>{dayLabel(date)}</strong> a las <strong className="font-mono">{slot.label}</strong>.
            </p>
            {clinic.address && <p className="mt-1 text-ink-2">Dirección: {clinic.address}</p>}
          </div>
          <Field id="wizard-reason" label="Motivo de la consulta" optional hint="Ej. control, dolor de cabeza. No escriba diagnósticos aquí.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </Field>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft /> Cambiar día u hora
            </Button>
            <Button size="lg" onClick={() => (setError(null), book.mutate())} disabled={book.isPending}>
              <CalendarCheck /> {book.isPending ? 'Guardando…' : 'Confirmar cita'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedPatient({ patient, onChange }: { patient: PatientView; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-4 py-3">
      <div className="min-w-0">
        <p className="font-bold">{patient.fullName}</p>
        <p className="text-sm text-ink-2">
          {patient.code} · {patient.age} años · {phone(patient.phone ?? patient.guardian?.phone)}
        </p>
      </div>
      <Button variant="link" size="sm" onClick={onChange}>
        Cambiar
      </Button>
    </div>
  );
}

function PatientStep({ onPick }: { onPick: (p: PatientView) => void }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(q.trim(), 300);
  const search = usePatientSearch({ q: debounced, pageSize: 8 }, debounced.length >= 2);

  if (creating) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="link" className="self-start" onClick={() => setCreating(false)}>
          <ArrowLeft /> Volver a buscar
        </Button>
        <PatientForm onSaved={onPick} onPickExisting={onPick} submitLabel="Guardar y seguir" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field id="wizard-search" label="Buscar paciente" hint="Por nombre, cédula, teléfono o código (P-00012). No importa si escribe sin tildes." addon={<Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden />}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} autoFocus autoComplete="off" className="pl-11" placeholder="Ej. maria lopez" />
      </Field>
      {debounced.length >= 2 && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {search.isFetching && !search.data && <Skeleton className="h-16" />}
          {search.data?.items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-3 rounded-md border-2 border-rule bg-surface px-4 py-3 text-left hover:border-ballpoint">
                <span className="min-w-0">
                  <span className="block font-bold">{p.fullName}</span>
                  <span className="block text-sm text-ink-2">
                    {p.code} · {p.age} años · {p.documentNumber ?? 'sin documento'} · {phone(p.phone ?? p.guardian?.phone)}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-ink-3" />
              </button>
            </li>
          ))}
          {search.data && search.data.items.length === 0 && <EmptyState title="No lo encontramos">Revise cómo lo escribió, o regístrelo como paciente nuevo.</EmptyState>}
        </ul>
      )}
      <Button variant="secondary" size="lg" onClick={() => setCreating(true)}>
        <UserPlus /> Registrar paciente nuevo
      </Button>
    </div>
  );
}

export function SlotPicker({ clinicId, date, selected, onSelect }: { clinicId?: string; date: string; selected: AvailabilitySlot | null; onSelect: (s: AvailabilitySlot) => void }) {
  const av = useAvailability(clinicId, date);
  const byDoctor = useMemo(() => {
    const m = new Map<string, AvailabilitySlot[]>();
    for (const s of av.data?.slots ?? []) m.set(s.doctorName, [...(m.get(s.doctorName) ?? []), s]);
    return [...m.entries()];
  }, [av.data]);

  if (av.isPending) return <Skeleton className="h-40" />;
  if (av.isError) return <Notice tone="warn" title="No se pudo cargar los horarios">{errorMessage(av.error)}</Notice>;
  if (av.data.closed) return <EmptyState title="Ese día no se atiende">{av.data.closed}</EmptyState>;
  if (!byDoctor.length) return <EmptyState title="Sin médicos ese día">Elija otro día u otra clínica.</EmptyState>;

  return (
    <div className="flex flex-col gap-5">
      {byDoctor.map(([doctor, slots]) => {
        const free = slots.filter((s) => s.available);
        return (
          <section key={doctor} className="flex flex-col gap-2">
            <h3 className="flex items-baseline justify-between gap-2 text-lg font-bold">
              {doctor}
              <span className="text-sm font-normal text-ink-3">{free.length ? `${free.length} libres` : 'Sin espacios'}</span>
            </h3>
            {free.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {free.map((s) => (
                  <button
                    key={s.startsAt}
                    type="button"
                    onClick={() => onSelect(s)}
                    aria-pressed={selected?.startsAt === s.startsAt && selected.doctorId === s.doctorId}
                    className="min-h-12 rounded-md border-2 border-rule-strong bg-surface font-mono text-lg font-medium hover:border-ballpoint hover:text-ballpoint aria-pressed:border-ballpoint aria-pressed:bg-ballpoint aria-pressed:text-ballpoint-ink"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-ink-3">Todo ocupado este día. Puede ponerlo en la lista de espera.</p>
            )}
          </section>
        );
      })}
      <p className="flex items-center gap-2 text-sm text-ink-3">
        <CalendarPlus className="size-4" aria-hidden /> Solo se muestran horarios libres. Las horas que ya pasaron no aparecen.
      </p>
    </div>
  );
}
