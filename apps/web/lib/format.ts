import { formatPhone } from '@clinagenda/schemas';

export const CLINIC_TZ = 'America/Guayaquil';

const dateFmt = new Intl.DateTimeFormat('es-EC', { timeZone: CLINIC_TZ, weekday: 'long', day: 'numeric', month: 'long' });
const shortDateFmt = new Intl.DateTimeFormat('es-EC', { timeZone: CLINIC_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('es-EC', { timeZone: CLINIC_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dateTimeFmt = new Intl.DateTimeFormat('es-EC', { timeZone: CLINIC_TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** "miércoles 18 de noviembre" */
export const longDate = (iso: string | Date) => dateFmt.format(new Date(iso));
export const shortDate = (iso: string | Date) => shortDateFmt.format(new Date(iso));
export const time = (iso: string | Date) => timeFmt.format(new Date(iso));
export const dateTime = (iso: string | Date) => dateTimeFmt.format(new Date(iso));
export const phone = (e164: string | null | undefined) => formatPhone(e164) || '—';

/** "2026-11-18" de hoy en la zona de las clínicas. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Fecha local de la clínica ("2026-11-18") de un instante: una cita a las 19:00 no cae al día siguiente. */
export function localDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-11-18" -> "miércoles 18 de noviembre" sin desfase de zona. */
export function dayLabel(iso: string): string {
  return longDate(`${iso}T17:00:00Z`);
}

/** "2026-11-18" + "09:30" en hora de las clínicas -> ISO con zona (-05:00). */
export function localIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00-05:00`;
}
