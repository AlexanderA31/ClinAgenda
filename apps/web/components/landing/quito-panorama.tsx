'use client';

import { useEffect, useState } from 'react';
import type { PublicDirectory } from '@clinagenda/schemas';
import { cn } from '@/lib/utils';
import s from './landing.module.css';
import { openState, type OpenState } from './hours';
import { slug } from './tone';

type Clinic = PublicDirectory['clinics'][number];

/**
 * El Pichincha detrás de la ciudad y las tres clínicas sobre la avenida, de norte a sur.
 * Cada parada dice si la clínica está abierta a la hora en que se mira (se refresca cada minuto).
 */
export function QuitoPanorama({ clinics, initial }: { clinics: Clinic[]; initial: OpenState[] }) {
  const [states, setStates] = useState(initial);
  useEffect(() => {
    const tick = () => setStates(clinics.map((c) => openState(c.schedule, c.closures)));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [clinics]);

  return (
    <div className="flex flex-col">
      <div className={s.panorama}>
        <span className={s.sun} aria-hidden />
        <svg viewBox="0 0 1200 320" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          {/* Rucu y Guagua Pichincha */}
          <path
            className={s.ridgeBack}
            d="M0 210 C120 170 220 120 330 95 C380 84 410 60 450 52 C480 46 500 70 530 80 C560 68 600 40 640 34 C690 30 720 70 780 95 C880 130 1000 120 1100 150 C1150 162 1180 170 1200 175 L1200 320 L0 320 Z"
          />
          <path className={s.ridgeMid} d="M0 240 C150 200 260 190 380 200 C520 212 600 170 760 180 C900 190 1000 215 1200 205 L1200 320 L0 320 Z" />
          <path className={s.ridgeFront} d="M0 262 C200 248 400 258 600 252 C800 246 1000 260 1200 250 L1200 320 L0 320 Z" />
          <path className={s.avenue} d="M0 286 C200 276 400 290 600 282 S1000 276 1200 286" pathLength={1} />
        </svg>
        {clinics.map((c, i) => (
          <span
            key={c.id}
            className={cn(s.pin, states[i]?.open && s.pinOpen)}
            style={{ left: `${((i * 2 + 1) / (clinics.length * 2)) * 100}%`, animationDelay: `${0.9 + i * 0.15}s` }}
            aria-hidden
          />
        ))}
      </div>
      <ol className={cn(s.stops, 'grid grid-cols-3 gap-3 px-2 pb-8 pt-3 text-center')} aria-label="Nuestras clínicas, de norte a sur">
        {clinics.map((c, i) => (
          <li key={c.id} className="flex min-w-0 flex-col items-center gap-1">
            <a href={`#${slug(c.name)}`} className="font-display text-lg font-extrabold leading-tight underline-offset-4 hover:underline sm:text-2xl">
              {c.name.replace('Clínica ', '')}
            </a>
            <span className={cn('text-sm font-bold sm:text-base', states[i]?.open ? s.liveOpen : 'opacity-75')}>
              <span className="sm:hidden">{states[i]?.open ? 'Abierta' : 'Cerrada'}</span>
              <span className="hidden sm:inline">{states[i]?.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
