'use client';

import { useMemo, useState } from 'react';
import type { PublicDirectory } from '@clinagenda/schemas';
import { cn } from '@/lib/utils';
import { daysShort } from './hours';

/** Médicos y dónde atiende cada uno, filtrable por clínica. */
export function DoctorDirectory({ data }: { data: PublicDirectory }) {
  const [clinicId, setClinicId] = useState<string>('all');
  const doctors = useMemo(
    () => data.doctors.filter((d) => d.assignments.length && (clinicId === 'all' || d.assignments.some((a) => a.clinicId === clinicId))),
    [data, clinicId],
  );
  const options = [{ id: 'all', name: 'Todas' }, ...data.clinics.map((c) => ({ id: c.id, name: c.name.replace('Clínica ', '') }))];

  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Filtrar por clínica" className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={clinicId === o.id}
            onClick={() => setClinicId(o.id)}
            className={cn(
              'min-h-11 rounded-full border-2 px-5 font-bold transition-colors',
              clinicId === o.id ? 'border-[var(--euc)] bg-[var(--euc)] text-[var(--euc-ink)]' : 'border-rule-strong text-ink-2 hover:border-[var(--euc)] hover:text-ink',
            )}
          >
            {o.name}
          </button>
        ))}
      </div>
      <ul className="flex flex-col">
        {doctors.map((d) => {
          const byClinic = new Map<string, { name: string; slots: typeof d.assignments }>();
          for (const a of d.assignments) {
            if (clinicId !== 'all' && a.clinicId !== clinicId) continue;
            const entry = byClinic.get(a.clinicId) ?? { name: a.clinicName.replace('Clínica ', ''), slots: [] };
            entry.slots.push(a);
            byClinic.set(a.clinicId, entry);
          }
          return (
            <li key={d.id} className="grid gap-x-8 gap-y-1 border-t border-rule py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div className="min-w-0">
                <p className="font-display text-xl font-bold">{d.fullName}</p>
                <p className="text-ink-2">{d.specialty}</p>
              </div>
              <ul className="flex min-w-0 flex-col gap-1">
                {[...byClinic.values()].map((c) => {
                  // Agrupa los días que comparten horario dentro de la misma clínica.
                  const byHours = new Map<string, number[]>();
                  for (const s of c.slots) byHours.set(`${s.startTime} a ${s.endTime}`, [...(byHours.get(`${s.startTime} a ${s.endTime}`) ?? []), s.weekday]);
                  return [...byHours.entries()].map(([hours, days]) => (
                    <li key={c.name + hours} className="text-ink">
                      <strong>{c.name}</strong>: {daysShort(days)}, de {hours}
                    </li>
                  ));
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
