'use client';

import type { PublicDirectory } from '@clinagenda/schemas';
import { cn } from '@/lib/utils';
import s from './landing.module.css';
import type { OpenState } from './hours';
import { useOpenStates } from './open-status';
import { PichinchaRidges } from './quito-panorama';

type Clinic = PublicDirectory['clinics'][number];

/**
 * El paisaje de la portada, fijo detrás de toda la página: el Pichincha, la avenida y una parada por
 * clínica (con pulso si está abierta ahora). Al bajar, el sol se pone y el cielo oscurece (solo CSS).
 */
export function QuitoBackdrop({ clinics, initial }: { clinics: Clinic[]; initial: OpenState[] }) {
  const states = useOpenStates(clinics, initial);

  return (
    <div className={s.backdrop} aria-hidden>
      <span className={s.dusk} />
      <div className={s.land}>
        <PichinchaRidges />
        {clinics.map((c, i) => (
          <span key={c.id} className={cn(s.pin, states[i]?.open && s.pinOpen)} style={{ left: `${((i * 2 + 1) / (clinics.length * 2)) * 100}%`, animationDelay: `${0.9 + i * 0.15}s` }} />
        ))}
      </div>
      <span className={s.veil} />
    </div>
  );
}
