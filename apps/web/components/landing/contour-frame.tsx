import { cn } from '@/lib/utils';
import e from './editorial.module.css';

/** Número pseudoaleatorio estable: el mismo dibujo en el servidor y en el navegador. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t * 9301 + 49297) % 233280;
    return t / 233280;
  };
}

/**
 * Curvas de nivel de un cerro, como en el mapa topográfico de Quito: anillos irregulares alrededor de
 * una cumbre. Cada clínica tiene su semilla, así cada cuadro es distinto pero siempre el mismo.
 */
function contourPaths(seed: number, rings = 16) {
  const rnd = seeded(seed);
  const phase = Array.from({ length: 4 }, () => rnd() * Math.PI * 2);
  const amp = [0.16 + rnd() * 0.1, 0.08 + rnd() * 0.06, 0.05 + rnd() * 0.04, 0.025];
  const cx = 150 + (rnd() - 0.5) * 60;
  const cy = 150 + (rnd() - 0.5) * 50;
  const paths: string[] = [];
  for (let k = 1; k <= rings; k++) {
    const r = 9 * k + k * k * 0.55;
    const pts: string[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const wob = 1 + amp[0] * Math.sin(2 * a + phase[0] + k * 0.12) + amp[1] * Math.sin(3 * a + phase[1]) + amp[2] * Math.sin(5 * a + phase[2] - k * 0.2) + amp[3] * Math.sin(9 * a + phase[3]);
      pts.push(`${(cx + Math.cos(a) * r * wob).toFixed(1)} ${(cy + Math.sin(a) * r * wob * 1.15).toFixed(1)}`);
    }
    paths.push(`M${pts.join(' L')}Z`);
  }
  return paths;
}

/**
 * Cuadro con el Pichincha en curvas de nivel. El dibujo es más alto que el cuadro y se desliza adentro
 * al hacer scroll (data-parallax-inner), como una foto que se mueve dentro de su marco.
 */
export function ContourFrame({ seed, tone, sun = false, label, className }: { seed: number; tone?: string; sun?: boolean; label?: string; className?: string }) {
  return (
    <figure className={cn(e.frame, tone, className)} aria-hidden={!label}>
      <div className={e.frameInner} data-parallax-inner>
        <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" className="size-full">
          {sun && <circle className={e.sun} cx="225" cy="95" r="42" />}
          {contourPaths(seed).map((d, i) => (
            <path key={i} className={e.contour} d={d} />
          ))}
          <path className={e.ridge} d="M0 330 C60 300 110 270 150 262 C190 254 230 290 300 300 L300 400 L0 400 Z" />
        </svg>
      </div>
      {label && <figcaption className={e.frameLabel}>{label}</figcaption>}
    </figure>
  );
}
