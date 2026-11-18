'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { WEEKDAY_LABELS, type DoctorView } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { dateTime, phone } from '@/lib/format';
import { useClinics } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';

interface Row {
  clinicId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

interface Orphan {
  id: string;
  code: string;
  startsAt: string;
  patientName: string;
  patientPhone: string | null;
  clinicName: string;
}

/**
 * Datos y horario semanal de un médico. Si el nuevo horario deja citas futuras fuera, el sistema
 * NO las cancela: muestra la lista para llamar a cada paciente y reprogramar.
 */
export function DoctorForm({ doctor, onDone }: { doctor?: DoctorView; onDone: () => void }) {
  const qc = useQueryClient();
  const clinics = useClinics();
  const [fullName, setFullName] = useState(doctor?.fullName ?? '');
  const [specialty, setSpecialty] = useState(doctor?.specialty ?? '');
  const [tel, setTel] = useState(doctor?.phone ? phone(doctor.phone) : '');
  const [active, setActive] = useState(doctor?.active ?? true);
  const [rows, setRows] = useState<Row[]>(doctor?.assignments.map(({ clinicId, weekday, startTime, endTime }) => ({ clinicId, weekday, startTime, endTime })) ?? []);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { fullName, specialty, phone: tel || null, assignments: rows, ...(doctor ? { active } : {}) };
      return doctor ? api<DoctorView & { appointmentsOutsideSchedule: Orphan[] }>(`/doctors/${doctor.id}`, { method: 'PATCH', body }) : api<DoctorView>('/doctors', { method: 'POST', body });
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['doctors'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      const out: Orphan[] = 'appointmentsOutsideSchedule' in r ? (r.appointmentsOutsideSchedule as Orphan[]) : [];
      if (out.length) {
        setOrphans(out);
        toast.warning(`Horario guardado. Hay ${out.length} cita(s) futuras fuera del nuevo horario: llame a esos pacientes.`);
      } else {
        toast.success('Médico guardado.');
        onDone();
      }
    },
    onError: (e) => setFields(e instanceof ApiRequestError ? e.fields : {}),
  });

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (orphans) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="warn" title="Estas citas quedaron fuera del horario del médico">
          No se cancelaron. Llame a cada paciente para cambiarla de día; la lista sigue disponible en Médicos → “Citas por reprogramar”.
        </Notice>
        <ul className="flex flex-col gap-2">
          {orphans.map((o) => (
            <li key={o.id} className="rounded-md border border-rule px-3 py-2">
              <span className="font-mono">{dateTime(o.startsAt)}</span> · <strong>{o.patientName}</strong> · {o.clinicName}
              <span className="block font-mono text-sm text-ink-2">{phone(o.patientPhone)}</span>
            </li>
          ))}
        </ul>
        <Button onClick={onDone}>Entendido</Button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), setFields({}), save.mutate())} noValidate>
      {save.isError && <Notice tone="danger" title="No se guardó">{errorMessage(save.error)}</Notice>}
      <Field id="doc-name" label="Nombre y apellido" error={fields.fullName}>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="doc-specialty" label="Especialidad" error={fields.specialty}>
          <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
        </Field>
        <Field id="doc-phone" label="Teléfono" optional error={fields.phone}>
          <Input type="tel" value={tel} onChange={(e) => setTel(e.target.value)} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-display text-lg font-bold">Horario semanal</legend>
        <p className="text-sm text-ink-3">Una fila por bloque. Un médico no puede tener dos bloques que se crucen, aunque sean en clínicas distintas.</p>
        {rows.map((r, i) => {
          const err = fields[`assignments.${i}`] ?? fields[`assignments.${i}.endTime`];
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.3fr_1fr_6rem_6rem_auto]">
                <Select aria-label="Clínica" value={r.clinicId} onChange={(e) => update(i, { clinicId: e.target.value })} aria-invalid={!!err || undefined}>
                  <option value="">Clínica…</option>
                  {clinics.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name.replace('Clínica ', '')}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Día" value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <option key={d} value={d}>
                      {WEEKDAY_LABELS[d]}
                    </option>
                  ))}
                </Select>
                <Input type="time" aria-label="Desde" value={r.startTime} onChange={(e) => update(i, { startTime: e.target.value })} />
                <Input type="time" aria-label="Hasta" value={r.endTime} onChange={(e) => update(i, { endTime: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar bloque" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              {err && <p role="alert" className="text-sm font-bold text-redpen">{err}</p>}
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setRows([...rows, { clinicId: clinics.data?.[0]?.id ?? '', weekday: 1, startTime: '08:00', endTime: '13:00' }])}
        >
          <Plus /> Agregar bloque
        </Button>
      </fieldset>

      {doctor && (
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-6 accent-[var(--ballpoint)]" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Está atendiendo (si lo desmarca, no se le pueden dar citas nuevas)
        </label>
      )}
      <Button type="submit" size="lg" disabled={save.isPending}>
        <Save /> Guardar
      </Button>
    </form>
  );
}
