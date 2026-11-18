'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { WEEKDAY_LABELS, timeToMinutes, type ClinicView, type DoctorView } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';
import landing from '@/components/landing/landing.module.css';
import { toneClass } from '@/components/landing/tone';

const DAYS = [1, 2, 3, 4, 5, 6];
type Block = { clinicId: string; weekday: number; startTime: string; endTime: string };
type Hours = 'mantener' | 'clinica';

const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Propone una semana para cada médico activo:
 *  - Respeta los días en que cada médico ya trabaja (si no tiene horario, lunes a viernes).
 *  - Solo usa las clínicas donde ya atiende (si no tiene ninguna, cualquiera).
 *  - Cada día elige, entre sus clínicas abiertas ese día, la que tiene menos médicos asignados:
 *    así las clínicas quedan cubiertas de forma pareja.
 *  - Las horas: las mismas del médico ajustadas al horario de la clínica, o todo el horario de la clínica.
 * Nada se guarda hasta "Aplicar"; los cambios de horario nunca cancelan citas.
 */
export function proposeSchedule(doctors: DoctorView[], clinics: ClinicView[], hours: Hours): Map<string, Block[]> {
  const load = new Map<string, number>(); // "clinicId|weekday" -> médicos asignados
  const result = new Map<string, Block[]>();
  const active = doctors.filter((d) => d.active).sort((a, b) => a.fullName.localeCompare(b.fullName));
  // Primero los médicos con menos opciones (una sola clínica): así los flexibles llenan los huecos.
  const options = (d: DoctorView) => new Set(d.assignments.map((a) => a.clinicId)).size || clinics.length;
  active.sort((a, b) => options(a) - options(b));

  for (const d of active) {
    const own = [...new Set(d.assignments.map((a) => a.clinicId))];
    const candidates = clinics.filter((c) => (own.length ? own.includes(c.id) : true));
    const workDays = d.assignments.length ? [...new Set(d.assignments.map((a) => a.weekday))] : [1, 2, 3, 4, 5];
    const blocks: Block[] = [];
    for (const day of workDays.sort()) {
      const open = candidates.filter((c) => c.schedule.some((s) => s.weekday === day) && c.active);
      if (!open.length) continue;
      const chosen = [...open].sort((a, b) => (load.get(`${a.id}|${day}`) ?? 0) - (load.get(`${b.id}|${day}`) ?? 0) || a.name.localeCompare(b.name))[0];
      load.set(`${chosen.id}|${day}`, (load.get(`${chosen.id}|${day}`) ?? 0) + 1);
      const clinicRanges = chosen.schedule.filter((s) => s.weekday === day);
      const mine = d.assignments.filter((a) => a.weekday === day);
      if (hours === 'mantener' && mine.length) {
        // Las horas de siempre del médico, recortadas al horario de la nueva clínica.
        for (const m of mine) {
          for (const r of clinicRanges) {
            const from = Math.max(timeToMinutes(m.startTime), timeToMinutes(r.startTime));
            const to = Math.min(timeToMinutes(m.endTime), timeToMinutes(r.endTime));
            if (to - from >= 30) blocks.push({ clinicId: chosen.id, weekday: day, startTime: toHhmm(from), endTime: toHhmm(to) });
          }
        }
        if (blocks.some((b) => b.weekday === day)) continue;
      }
      for (const r of clinicRanges) blocks.push({ clinicId: chosen.id, weekday: day, startTime: r.startTime, endTime: r.endTime });
    }
    result.set(d.id, blocks);
  }
  return result;
}

const same = (a: Block[], b: Block[]) => {
  const key = (x: Block) => `${x.clinicId}|${x.weekday}|${x.startTime}|${x.endTime}`;
  return a.length === b.length && a.map(key).sort().join() === b.map(key).sort().join();
};

export function AutoSchedule({ doctors, clinics, onDone }: { doctors: DoctorView[]; clinics: ClinicView[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [hours, setHours] = useState<Hours>('mantener');
  const proposal = useMemo(() => proposeSchedule(doctors, clinics, hours), [doctors, clinics, hours]);
  const changed = doctors.filter((d) => proposal.has(d.id) && !same(d.assignments, proposal.get(d.id)!));
  const clinicName = (id: string) => clinics.find((c) => c.id === id)?.name ?? '';

  const apply = useMutation({
    mutationFn: async () => {
      let outside = 0;
      for (const d of changed) {
        const r = await api<{ appointmentsOutsideSchedule: unknown[] }>(`/doctors/${d.id}`, { method: 'PATCH', body: { assignments: proposal.get(d.id) } });
        outside += r.appointmentsOutsideSchedule.length;
      }
      return outside;
    },
    onSuccess: (outside) => {
      void qc.invalidateQueries({ queryKey: ['doctors'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      if (outside) toast.warning(`Horarios aplicados. ${outside} cita(s) futuras quedaron fuera: revíselas en “Citas por reprogramar” de cada médico.`, { duration: 15000 });
      else toast.success(`Horarios aplicados a ${changed.length} médico(s). Ninguna cita quedó fuera.`);
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Cuántos médicos tiene cada clínica cada día con la propuesta: para ver que quede parejo.
  const coverage = (clinicId: string, day: number) => [...proposal.values()].filter((bs) => bs.some((b) => b.clinicId === clinicId && b.weekday === day)).length;

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Horas" className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ['mantener', 'Mantener las horas de cada médico', 'Solo cambia en qué clínica atiende cada día.'],
            ['clinica', 'Todo el horario de la clínica', 'Cada médico cubre la clínica de apertura a cierre.'],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={hours === value}
            onClick={() => setHours(value)}
            className={cn('flex flex-col gap-0.5 rounded-md border-2 p-3 text-left', hours === value ? 'border-ballpoint bg-ballpoint-soft' : 'border-rule hover:border-rule-strong')}
          >
            <span className="font-bold">{label}</span>
            <span className="text-sm text-ink-2">{hint}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-rule">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead>
            <tr className="border-b border-rule bg-surface-2">
              <th className="px-3 py-2 font-bold">Médico</th>
              {DAYS.map((d) => (
                <th key={d} className="px-2 py-2 font-bold">
                  {WEEKDAY_LABELS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doctors
              .filter((d) => proposal.has(d.id))
              .map((d) => {
                const blocks = proposal.get(d.id)!;
                const isChanged = changed.includes(d);
                return (
                  <tr key={d.id} className="border-b border-rule last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-bold">{d.fullName}</span>
                      {isChanged && <span className="ml-2 rounded-sm bg-warn-soft px-1.5 text-xs font-bold text-warn">Cambia</span>}
                    </td>
                    {DAYS.map((day) => {
                      const bs = blocks.filter((b) => b.weekday === day);
                      return (
                        <td key={day} className="px-2 py-2 align-top">
                          {bs.length ? (
                            <span className="flex items-start gap-1.5">
                              <span className={cn(landing.dot, toneClass(clinicName(bs[0].clinicId)), 'mt-1.5')} aria-hidden />
                              <span className="flex flex-col leading-tight">
                                <span className="font-bold">{clinicName(bs[0].clinicId).replace('Clínica ', '')}</span>
                                <span className="tabular whitespace-nowrap text-ink-3">{bs.map((b) => `${b.startTime}–${b.endTime}`).join(', ')}</span>
                              </span>
                            </span>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
          <tfoot>
            {clinics.map((c) => (
              <tr key={c.id} className="border-t border-rule bg-surface-2/60">
                <td className="px-3 py-1.5 text-ink-2">Médicos en {c.name.replace('Clínica ', '')}</td>
                {DAYS.map((day) => (
                  <td key={day} className="tabular px-2 py-1.5 font-bold">
                    {c.schedule.some((s) => s.weekday === day) ? coverage(c.id, day) : <span className="font-normal text-ink-3">cerrada</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      <Notice tone="info">
        {changed.length
          ? `Cambia el horario de ${changed.length} médico(s). Las citas ya dadas no se cancelan: si alguna queda fuera, aparece en “Citas por reprogramar”.`
          : 'Los horarios actuales ya están repartidos así: no hay nada que cambiar.'}
      </Notice>
      <Button size="lg" disabled={!changed.length || apply.isPending} onClick={() => apply.mutate()}>
        {apply.isPending ? (
          'Aplicando…'
        ) : (
          <>
            <Check /> Aplicar a {changed.length} médico(s)
          </>
        )}
      </Button>
    </div>
  );
}

export { Wand2 as AutoScheduleIcon };
