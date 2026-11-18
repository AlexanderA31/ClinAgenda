'use client';

import type { PublicDirectory } from '@clinagenda/schemas';
import { cn } from '@/lib/utils';
import s from './landing.module.css';
import type { OpenState } from './hours';
import { useOpenStates } from './open-status';
import { slug } from './tone';

type Clinic = PublicDirectory['clinics'][number];

/** El nombre de cada clínica sobre su parada de la avenida, con su estado a la hora en que se mira. */
export function ClinicStops({ clinics, initial }: { clinics: Clinic[]; initial: OpenState[] }) {
  const states = useOpenStates(clinics, initial);

  return (
    <ol className="grid grid-cols-3 gap-3 text-center" aria-label="Nuestras clínicas, de norte a sur" style={{ gridTemplateColumns: `repeat(${clinics.length}, minmax(0, 1fr))` }}>
      {clinics.map((c, i) => (
        <li key={c.id} className="flex min-w-0 flex-col items-center gap-1">
          <a href={`#${slug(c.name)}`} className="font-display text-lg font-extrabold leading-tight underline-offset-4 hover:underline sm:text-2xl">
            {c.name.replace('Clínica ', '')}
          </a>
          <span className={cn('text-sm font-bold sm:text-base', states[i]?.open ? s.liveOpen : 'text-ink-2')}>
            <span className="sm:hidden">{states[i]?.open ? 'Abierta' : 'Cerrada'}</span>
            <span className="hidden sm:inline">{states[i]?.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
