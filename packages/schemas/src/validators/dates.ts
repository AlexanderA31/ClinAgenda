/** Utilidades de fecha que no dependen de la zona horaria del navegador o del servidor. */

export const MAX_AGE_YEARS = 120;

/** "2024-02-30" no es una fecha real aunque tenga el formato correcto. */
export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Edad cumplida en años a la fecha `today` (YYYY-MM-DD). */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de las clínicas. */
export function todayIn(timeZone = 'America/Guayaquil', now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
