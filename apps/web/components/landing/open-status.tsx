'use client';

import { useEffect, useState } from 'react';
import type { WeeklySlot } from '@clinagenda/schemas';
import { openState, type OpenState } from './hours';
import { cn } from '@/lib/utils';

/** Se calcula en el servidor y se refresca en el navegador cada minuto: siempre dice la verdad a la hora en que se mira. */
export function OpenStatus({ schedule, closures, initial }: { schedule: WeeklySlot[]; closures: { date: string; reason: string }[]; initial: { open: boolean; text: string } }) {
  const [state, setState] = useState(initial);
  useEffect(() => {
    const tick = () => setState(openState(schedule, closures));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [schedule, closures]);
  return (
    <p className={cn('flex items-center gap-2 font-bold', state.open ? 'text-good' : 'text-ink-2')}>
      <span className={cn('inline-block size-2.5 rounded-full', state.open ? 'bg-good' : 'border-2 border-ink-3')} aria-hidden />
      {state.text}
    </p>
  );
}

/** Abierta o cerrada, por clínica: se refresca cada minuto para decir la verdad a la hora en que se mira. */
export function useOpenStates(clinics: { schedule: WeeklySlot[]; closures: { date: string; reason: string }[] }[], initial: OpenState[]) {
  const [states, setStates] = useState(initial);
  useEffect(() => {
    const tick = () => setStates(clinics.map((c) => openState(c.schedule, c.closures)));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [clinics]);
  return states;
}
