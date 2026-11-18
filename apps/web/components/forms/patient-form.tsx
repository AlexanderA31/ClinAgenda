'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  ADULT_AGE,
  PatientCreateSchema,
  ageOn,
  isRealIsoDate,
  todayIn,
  type DuplicateCandidate,
  type PatientView,
} from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { phone as fmtPhone } from '@/lib/format';
import { useDebounced } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface PatientFormValues {
  firstNames: string;
  lastNames: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  birthDateEstimated: boolean;
  sex: '' | 'F' | 'M' | 'X';
  documentType: 'CEDULA' | 'PASAPORTE' | 'SIN_DOCUMENTO';
  documentNumber: string;
  noDocumentReason: string;
  phone: string;
  email: string;
  address: string;
  contactNote: string;
  hasGuardian: boolean;
  guardianName: string;
  guardianRelationship: string;
  guardianPhone: string;
  confirmNotDuplicate: boolean;
}

function birthIso(v: Pick<PatientFormValues, 'birthDay' | 'birthMonth' | 'birthYear'>): string {
  if (!v.birthDay || !v.birthMonth || !v.birthYear) return '';
  return `${v.birthYear.padStart(4, '0')}-${v.birthMonth.padStart(2, '0')}-${v.birthDay.padStart(2, '0')}`;
}

function toPayload(v: PatientFormValues) {
  return {
    firstNames: v.firstNames,
    lastNames: v.lastNames,
    birthDate: birthIso(v),
    birthDateEstimated: v.birthDateEstimated,
    sex: v.sex || null,
    documentType: v.documentType,
    documentNumber: v.documentType === 'SIN_DOCUMENTO' ? null : v.documentNumber,
    noDocumentReason: v.documentType === 'SIN_DOCUMENTO' ? v.noDocumentReason : null,
    phone: v.phone,
    email: v.email,
    address: v.address,
    contactNote: v.contactNote,
    guardian: v.hasGuardian ? { fullName: v.guardianName, relationship: v.guardianRelationship, phone: v.guardianPhone } : null,
    confirmNotDuplicate: v.confirmNotDuplicate,
  };
}

/** Traduce rutas del schema ("guardian.fullName", "birthDate") a los campos del formulario. */
function toFieldName(path: string): keyof PatientFormValues {
  const map: Record<string, keyof PatientFormValues> = {
    birthDate: 'birthYear',
    guardian: 'guardianName',
    'guardian.fullName': 'guardianName',
    'guardian.relationship': 'guardianRelationship',
    'guardian.phone': 'guardianPhone',
  };
  return map[path] ?? (path as keyof PatientFormValues);
}

// El mismo schema que usa la API valida aquí: los mensajes son idénticos en ambos lados.
const resolver: Resolver<PatientFormValues> = async (values) => {
  const r = PatientCreateSchema.safeParse(toPayload(values));
  if (r.success) return { values, errors: {} };
  const errors: FieldErrors<PatientFormValues> = {};
  for (const issue of r.error.issues) {
    const name = toFieldName(issue.path.join('.'));
    if (!errors[name]) errors[name] = { type: 'validation', message: issue.message };
  }
  return { values: {}, errors };
};

export function patientToForm(p: PatientView): PatientFormValues {
  const [y, m, d] = p.birthDate.split('-');
  return {
    firstNames: p.firstNames,
    lastNames: p.lastNames,
    birthDay: String(Number(d)),
    birthMonth: String(Number(m)),
    birthYear: y,
    birthDateEstimated: p.birthDateEstimated,
    sex: p.sex ?? '',
    documentType: p.documentType,
    documentNumber: p.documentNumber ?? '',
    noDocumentReason: p.noDocumentReason ?? '',
    phone: p.phone ? fmtPhone(p.phone) : '',
    email: p.email ?? '',
    address: p.address ?? '',
    contactNote: p.contactNote ?? '',
    hasGuardian: !!p.guardian,
    guardianName: p.guardian?.fullName ?? '',
    guardianRelationship: p.guardian?.relationship ?? '',
    guardianPhone: p.guardian?.phone ? fmtPhone(p.guardian.phone) : '',
    confirmNotDuplicate: true,
  };
}

const EMPTY: PatientFormValues = {
  firstNames: '',
  lastNames: '',
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  birthDateEstimated: false,
  sex: '',
  documentType: 'CEDULA',
  documentNumber: '',
  noDocumentReason: '',
  phone: '',
  email: '',
  address: '',
  contactNote: '',
  hasGuardian: false,
  guardianName: '',
  guardianRelationship: '',
  guardianPhone: '',
  confirmNotDuplicate: false,
};

export function PatientForm({
  patient,
  onSaved,
  onPickExisting,
  submitLabel = 'Guardar paciente',
}: {
  patient?: PatientView;
  onSaved: (p: PatientView) => void;
  /** Al crear: la recepcionista se da cuenta de que el paciente ya existía y lo elige. */
  onPickExisting?: (p: PatientView) => void;
  submitLabel?: string;
}) {
  const qc = useQueryClient();
  const editing = !!patient;
  const [formError, setFormError] = useState<string | null>(null);
  const [serverCandidates, setServerCandidates] = useState<DuplicateCandidate[] | null>(null);
  const { register, handleSubmit, watch, setError, setValue, formState } = useForm<PatientFormValues>({
    defaultValues: patient ? patientToForm(patient) : EMPTY,
    resolver,
    mode: 'onTouched',
  });

  const v = watch();
  const birth = birthIso(v);
  const age = birth && isRealIsoDate(birth) && birth <= todayIn() ? ageOn(birth, todayIn()) : null;
  const isMinor = age !== null && age < ADULT_AGE;
  const showGuardian = isMinor || v.hasGuardian;

  useEffect(() => {
    if (isMinor && !v.hasGuardian) setValue('hasGuardian', true);
  }, [isMinor, v.hasGuardian, setValue]);

  // Mientras escribe, se buscan pacientes parecidos para evitar duplicados.
  const dupInput = useDebounced({ firstNames: v.firstNames, lastNames: v.lastNames, birthDate: birth || null, documentNumber: v.documentNumber || null, phone: v.phone || null }, 600);
  const canCheck = !editing && dupInput.firstNames.trim().length >= 2 && dupInput.lastNames.trim().length >= 2;
  const live = useQuery({
    queryKey: ['patients', 'duplicates', dupInput],
    queryFn: () => api<DuplicateCandidate[]>('/patients/duplicates', { method: 'POST', body: dupInput }),
    enabled: canCheck,
    staleTime: 30_000,
  });
  const candidates = useMemo(() => (serverCandidates ?? live.data ?? []).filter((c) => c.score >= 0.45), [serverCandidates, live.data]);

  const save = useMutation({
    mutationFn: (values: PatientFormValues) =>
      editing ? api<PatientView>(`/patients/${patient!.id}`, { method: 'PUT', body: toPayload(values) }) : api<PatientView>('/patients', { method: 'POST', body: toPayload(values) }),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['patients'] });
      toast.success(editing ? 'Datos del paciente actualizados.' : `Paciente registrado: ${p.fullName} (${p.code}).`);
      onSaved(p);
    },
    onError: (e) => {
      if (e instanceof ApiRequestError) {
        for (const [path, message] of Object.entries(e.fields)) setError(toFieldName(path), { message });
        const details = e.body.details as { candidates?: DuplicateCandidate[]; blocking?: boolean } | undefined;
        if (e.code === 'POSSIBLE_DUPLICATE' && details?.candidates) setServerCandidates(details.candidates);
      }
      setFormError(errorMessage(e));
    },
  });

  const onSubmit = handleSubmit(
    (values) => {
      setFormError(null);
      save.mutate(values);
    },
    () => setFormError('Revise los campos marcados en rojo. Lo que ya escribió se conserva.'),
  );

  const err = (k: keyof PatientFormValues) => formState.errors[k]?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Notice tone="danger" title="No se guardó todavía">{formError}</Notice>}

      {candidates.length > 0 && (
        <section className="flex flex-col gap-3 rounded-md border-2 border-warn/50 bg-warn-soft p-4" aria-live="polite">
          <p className="font-bold">¿Es alguno de estos pacientes? Ya están registrados:</p>
          <ul className="flex flex-col gap-2">
            {candidates.slice(0, 4).map((c) => (
              <li key={c.patient.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="font-bold">
                    {c.patient.fullName} <span className="font-mono text-sm text-ink-3">{c.patient.code}</span>
                  </p>
                  <p className="text-sm text-ink-2">
                    {c.patient.age} años · {c.patient.documentNumber ?? 'sin documento'} · {fmtPhone(c.patient.phone)}
                  </p>
                  <p className="text-sm text-warn">{c.reasons.join(' · ')}</p>
                </div>
                {onPickExisting && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => onPickExisting(c.patient)}>
                    <UserCheck /> Es este paciente
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <label className="flex min-h-11 items-center gap-3 font-bold">
            <input type="checkbox" className="size-6 accent-[var(--ballpoint)]" {...register('confirmNotDuplicate')} />
            No es ninguno: es una persona distinta
          </label>
        </section>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg font-bold">Nombre</legend>
        <Field id="firstNames" label="Nombres" error={err('firstNames')}>
          <Input autoComplete="off" {...register('firstNames')} />
        </Field>
        <Field id="lastNames" label="Apellidos" error={err('lastNames')}>
          <Input autoComplete="off" {...register('lastNames')} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-display text-lg font-bold">Fecha de nacimiento</legend>
        <div className="grid grid-cols-[5rem_1fr_6.5rem] gap-3">
          <Field id="birthDay" label="Día">
            <Input inputMode="numeric" maxLength={2} placeholder="15" {...register('birthDay')} />
          </Field>
          <Field id="birthMonth" label="Mes">
            <Select {...register('birthMonth')}>
              <option value="">Elija…</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="birthYear" label="Año">
            <Input inputMode="numeric" maxLength={4} placeholder="1968" {...register('birthYear')} />
          </Field>
        </div>
        {err('birthYear') ? (
          <p role="alert" className="text-sm font-bold text-redpen">
            {err('birthYear')}
          </p>
        ) : (
          age !== null && <p className="text-sm text-ink-2">Edad: {age} años{isMinor && ' — menor de edad, se pedirá un representante.'}</p>
        )}
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-6 accent-[var(--ballpoint)]" {...register('birthDateEstimated')} />
          No sabe la fecha exacta (se guarda como aproximada)
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg font-bold">Documento</legend>
        <Field id="documentType" label="Tipo de documento" error={err('documentType')}>
          <Select {...register('documentType')}>
            <option value="CEDULA">Cédula ecuatoriana</option>
            <option value="PASAPORTE">Pasaporte (extranjero)</option>
            <option value="SIN_DOCUMENTO">No tiene documento</option>
          </Select>
        </Field>
        {v.documentType === 'SIN_DOCUMENTO' ? (
          <Field id="noDocumentReason" label="¿Por qué no tiene?" hint='Ej. "Recién nacido, aún sin cédula"' error={err('noDocumentReason')}>
            <Input {...register('noDocumentReason')} />
          </Field>
        ) : (
          <Field
            id="documentNumber"
            label={v.documentType === 'CEDULA' ? 'Número de cédula' : 'Número de pasaporte'}
            hint={v.documentType === 'CEDULA' ? '10 números, sin guion' : undefined}
            error={err('documentNumber')}
          >
            <Input inputMode={v.documentType === 'CEDULA' ? 'numeric' : 'text'} autoComplete="off" className="font-mono tracking-wider" {...register('documentNumber')} />
          </Field>
        )}
        <Field id="sex" label="Sexo" optional>
          <Select {...register('sex')}>
            <option value="">Sin indicar</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
            <option value="X">Otro</option>
          </Select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg font-bold">Cómo contactarlo</legend>
        <Field id="phone" label="Teléfono o celular" optional hint="Ej. 099 123 4567" error={err('phone')}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...register('phone')} />
        </Field>
        <Field id="email" label="Correo" optional error={err('email')}>
          <Input type="email" inputMode="email" autoComplete="off" {...register('email')} />
        </Field>
        <Field id="address" label="Dirección" optional className="sm:col-span-2">
          <Input {...register('address')} />
        </Field>
        {!v.phone && !v.email && !(showGuardian && v.guardianPhone) && (
          <Field id="contactNote" label="Si no tiene teléfono ni correo: ¿cómo le avisamos?" hint="Ej. Llamar a su hija Carmen, 098…; o avisar en la tienda de enfrente." error={err('contactNote')} className="sm:col-span-2">
            <Textarea {...register('contactNote')} />
          </Field>
        )}
      </fieldset>

      <fieldset className={cn('flex flex-col gap-4', !showGuardian && 'gap-2')}>
        <legend className="mb-2 font-display text-lg font-bold">Representante</legend>
        {!isMinor && (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-6 accent-[var(--ballpoint)]" {...register('hasGuardian')} />
            Viene con un familiar o cuidador responsable
          </label>
        )}
        {showGuardian && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="guardianName" label="Nombre del representante" error={err('guardianName')} className="sm:col-span-3">
              <Input {...register('guardianName')} />
            </Field>
            <Field id="guardianRelationship" label="Parentesco" hint="Madre, padre, hijo…" error={err('guardianRelationship')}>
              <Input {...register('guardianRelationship')} />
            </Field>
            <Field id="guardianPhone" label="Teléfono del representante" error={err('guardianPhone')} className="sm:col-span-2">
              <Input type="tel" inputMode="tel" {...register('guardianPhone')} />
            </Field>
          </div>
        )}
      </fieldset>

      <div className="sticky bottom-0 -mx-5 border-t border-rule bg-surface px-5 py-3">
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={save.isPending}>
          <Save /> {save.isPending ? 'Guardando…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
