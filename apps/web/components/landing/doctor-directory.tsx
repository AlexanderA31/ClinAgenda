'use client';

import { useMemo, useState } from 'react';
import type { PublicDirectory } from '@clinagenda/schemas';
import { cn } from '@/lib/utils';
import s from './landing.module.css';
import { daysShort } from './hours';
import { initials, toneClass } from './tone';

/** Médicos y dónde atiende cada uno, filtrable por clínica. */
export function DoctorDirectory({ data }: { data: PublicDirectory }) {
  const [clinicId, setClinicId] = useState<string>('all');
  const doctors = useMemo(
    () => data.doctors.filter((d) => d.assignments.length && (clinicId === 'all' || d.assignments.some((a) => a.clinicId === clinicId))),
    [data, clinicId],
  );
  const options = [{ id: 'all', name: 'Todas', tone: '' }, ...data.clinics.map((c) => ({ id: c.id, name: c.name.replace('Clínica ', ''), tone: toneClass(c.name) }))];

  return (
    <div className="flex flex-col gap-8">
      <div role="radiogroup" aria-label="Filtrar por clínica" className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={clinicId === o.id}
            onClick={() => setClinicId(o.id)}
            className={cn(o.tone, s.chip, 'min-h-12 rounded-full border-2 px-6 text-lg font-bold')}
          >
            {o.name}
          </button>
        ))}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doctors.map((d) => {
          const byClinic = new Map<string, { name: string; slots: typeof d.assignments }>();
          for (const a of d.assignments) {
            if (clinicId !== 'all' && a.clinicId !== clinicId) continue;
            const entry = byClinic.get(a.clinicId) ?? { name: a.clinicName, slots: [] };
            entry.slots.push(a);
            byClinic.set(a.clinicId, entry);
          }
          const clinics = [...byClinic.values()];
          return (
            <li key={d.id} className={cn(s.doctor, 'flex min-w-0 flex-col gap-4 rounded-2xl p-5')}>
              <div className="flex items-center gap-4">
                <span className={cn(s.avatar, toneClass(clinics[0]?.name ?? ''))} aria-hidden>
                  {initials(d.fullName)}
                </span>
                <div className="min-w-0">
                  <p className="font-display text-xl font-bold leading-tight">{d.fullName}</p>
                  <p className="text-ink-2">{d.specialty}</p>
                </div>
              </div>
              <ul className="flex flex-col gap-1.5">
                {clinics.map((c) => {
                  // Agrupa los días que comparten horario dentro de la misma clínica.
                  const byHours = new Map<string, number[]>();
                  for (const slot of c.slots) byHours.set(`${slot.startTime} a ${slot.endTime}`, [...(byHours.get(`${slot.startTime} a ${slot.endTime}`) ?? []), slot.weekday]);
                  return [...byHours.entries()].map(([hours, days]) => (
                    <li key={c.name + hours} className="flex items-baseline gap-2">
                      <span className={cn(s.dot, toneClass(c.name))} aria-hidden />
                      <span>
                        <strong>{c.name.replace('Clínica ', '')}</strong>: {daysShort(days)}, de {hours}
                      </span>
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
