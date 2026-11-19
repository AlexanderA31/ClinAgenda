'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { PatientView, WaitlistEntryView } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { dateTime, phone } from '@/lib/format';
import { useDebounced, useDoctors, usePatientSearch, useWorkClinics } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, Notice, PageHeader, Skeleton } from '@/components/ui/misc';
import { BookingWizard, type BookingPreset } from '@/components/appointments/booking-wizard';
import { RequirePermission } from '@/components/layout/require-role';

export default function WaitlistPage() {
  return (
    <RequirePermission permission="lista_espera.gestionar">
      <Waitlist />
    </RequirePermission>
  );
}

function Waitlist() {
  const clinics = useWorkClinics();
  const [clinicId, setClinicId] = useState('');
  const [adding, setAdding] = useState(false);
  const [booking, setBooking] = useState<BookingPreset | null>(null);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['waitlist', clinicId], queryFn: () => api<WaitlistEntryView[]>('/waitlist', { query: { clinicId: clinicId || undefined } }) });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/waitlist/${id}`, { method: 'DELETE' }),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['waitlist'] }), toast.success('Quitado de la lista de espera.')),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="Lista de espera"
        description="Pacientes que quieren una cita antes de lo que hay disponible. Cuando alguien cancela, el sistema avisa y usted los llama en este orden."
        actions={
          <Button size="lg" onClick={() => setAdding(true)}>
            <Plus /> Agregar paciente
          </Button>
        }
      />
      <Select aria-label="Clínica" className="w-auto self-start" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
        <option value="">Todas las clínicas</option>
        {clinics.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : list.isError ? (
        <Notice tone="danger" title="No se pudo cargar la lista de espera">
          {errorMessage(list.error)}
        </Notice>
      ) : list.data?.length ? (
        <ol className="flex flex-col gap-2">
          {list.data.map((e, i) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-surface px-4 py-3">
              <div className="flex min-w-0 items-start gap-4">
                <span className="tabular font-display text-2xl font-extrabold text-ink-3">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-bold">{e.patient.fullName}</p>
                  <p className="text-ink-2">
                    <span className="font-mono">{phone(e.patient.phone)}</span> · {e.clinic.name}
                    {e.doctor && ` · con ${e.doctor.fullName}`}
                  </p>
                  <p className="text-sm text-ink-3">
                    {e.preference && `Prefiere: ${e.preference} · `}En espera desde {dateTime(e.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setBooking({ clinicId: e.clinic.id, waitlistEntryId: e.id, patient: { id: e.patient.id, fullName: e.patient.fullName, phone: e.patient.phone } as PatientView })}>
                  <CalendarPlus /> Darle cita
                </Button>
                <ConfirmButton label="Quitar" confirmLabel="Sí, quitar de la lista" busy={remove.isPending} onConfirm={() => remove.mutate(e.id)} ariaLabel={`Quitar a ${e.patient.fullName} de la lista`} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="Nadie en espera">Cuando un paciente pida una hora que no hay, agréguelo aquí.</EmptyState>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent side title="Agregar a la lista de espera">
          {adding && <AddForm onDone={() => setAdding(false)} />}
        </DialogContent>
      </Dialog>
      <BookingWizard open={!!booking} onOpenChange={(o) => !o && setBooking(null)} preset={booking ?? undefined} />
    </>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const clinics = useWorkClinics();
  const [q, setQ] = useState('');
  const [patient, setPatient] = useState<PatientView | null>(null);
  const [clinicId, setClinicId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [preference, setPreference] = useState('');
  const doctors = useDoctors(clinicId || undefined);
  const debounced = useDebounced(q.trim(), 300);
  const search = usePatientSearch({ q: debounced, pageSize: 6 }, debounced.length >= 2 && !patient);
  const save = useMutation({
    mutationFn: () => api('/waitlist', { method: 'POST', body: { patientId: patient!.id, clinicId, doctorId: doctorId || null, preference: preference || null } }),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['waitlist'] }), toast.success('Agregado a la lista de espera.'), onDone()),
  });
  return (
    <div className="flex flex-col gap-4">
      {save.isError && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
      {patient ? (
        <div className="flex items-center justify-between rounded-md bg-surface-2 px-4 py-3">
          <span className="font-bold">{patient.fullName}</span>
          <Button variant="link" onClick={() => setPatient(null)}>
            Cambiar
          </Button>
        </div>
      ) : (
        <>
          <Field id="wl-q" label="Paciente">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, cédula o teléfono" />
          </Field>
          <ul className="flex flex-col gap-1">
            {search.data?.items.map((p) => (
              <li key={p.id}>
                <button type="button" className="w-full rounded-md border border-rule px-3 py-2 text-left hover:border-ballpoint" onClick={() => setPatient(p)}>
                  <span className="font-bold">{p.fullName}</span> <span className="text-ink-3">{p.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Field id="wl-clinic" label="Clínica">
        <Select value={clinicId} onChange={(e) => (setClinicId(e.target.value), setDoctorId(''))}>
          <option value="">Elija…</option>
          {clinics.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="wl-doctor" label="Médico" optional>
        <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={!clinicId}>
          <option value="">Cualquiera</option>
          {doctors.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName} — {d.specialty}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="wl-pref" label="Preferencia" optional hint='Ej. "solo mañanas", "después de las 3"'>
        <Input value={preference} onChange={(e) => setPreference(e.target.value)} maxLength={200} />
      </Field>
      <Button size="lg" disabled={!patient || !clinicId || save.isPending} onClick={() => save.mutate()}>
        <Plus /> Agregar
      </Button>
    </div>
  );
}
