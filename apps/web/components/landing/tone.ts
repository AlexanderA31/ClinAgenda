import s from './landing.module.css';

/**
 * Cada clínica tiene su color en toda la página: eucalipto para el norte, azul colonial para el
 * centro y amarillo maíz para el sur. Así un paciente reconoce "su" clínica de un vistazo.
 */
export function toneClass(clinicName: string): string {
  if (clinicName.includes('Norte')) return s.toneNorte;
  if (clinicName.includes('Sur')) return s.toneSur;
  if (clinicName.includes('Centro')) return s.toneCentro;
  // Una clínica nueva (creada desde "Clínicas") lleva un tono propio, distinto de las tres de siempre.
  return s.toneOtra;
}

/** "Verónica Paredes" -> "VP". */
export function initials(fullName: string): string {
  const parts = fullName.replace(/^(Dra?\.?)\s+/i, '').split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** "Clínica Norte" -> "clinica-norte", para enlazar desde la portada a cada clínica. */
export function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-');
}
