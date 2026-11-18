import { DateTime } from 'luxon';

/**
 * Todas las fechas se guardan en UTC. Los horarios de las clínicas ("08:00") están en hora local
 * de cada clínica. Estas funciones hacen la conversión usando la zona IANA de la clínica, así un
 * eventual cambio de horario (DST) o una clínica en otra zona no desfasa las citas.
 */

export function inZone(date: Date | string, timeZone: string): DateTime {
  const dt = typeof date === 'string' ? DateTime.fromISO(date, { setZone: true }) : DateTime.fromJSDate(date);
  return dt.setZone(timeZone);
}

/** 0 = domingo … 6 = sábado (igual que en la base de datos). */
export function weekdayOf(dt: DateTime): number {
  return dt.weekday % 7;
}

export function minutesOfDay(dt: DateTime): number {
  return dt.hour * 60 + dt.minute;
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToHhmm(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "2026-11-23" + 570 minutos en Guayaquil -> Date UTC. */
export function localToUtc(date: string, minutes: number, timeZone: string): Date {
  return DateTime.fromISO(date, { zone: timeZone }).startOf('day').plus({ minutes }).toUTC().toJSDate();
}

/** Inicio y fin (exclusivo) de un día local, en UTC. */
export function dayBoundsUtc(date: string, timeZone: string): { start: Date; end: Date } {
  const start = DateTime.fromISO(date, { zone: timeZone }).startOf('day');
  return { start: start.toUTC().toJSDate(), end: start.plus({ days: 1 }).toUTC().toJSDate() };
}

export function rangeBoundsUtc(from: string, to: string, timeZone: string): { start: Date; end: Date } {
  return { start: dayBoundsUtc(from, timeZone).start, end: dayBoundsUtc(to, timeZone).end };
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatLocal(date: Date, timeZone: string): string {
  return inZone(date, timeZone).setLocale('es').toFormat("cccc d 'de' LLLL, HH:mm");
}

export const DEFAULT_TZ = 'America/Guayaquil';
