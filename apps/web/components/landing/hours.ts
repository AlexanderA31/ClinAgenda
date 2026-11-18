import { WEEKDAY_LABELS, type WeeklySlot } from '@clinagenda/schemas';

const TZ = 'America/Guayaquil';

/** Día de la semana (0 = domingo) y minutos del día en hora de Quito. */
export function quitoNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export interface OpenState {
  open: boolean;
  text: string;
}

/** "Abierta ahora, hasta las 18:00" o "Cerrada. Abre mañana a las 08:00". */
export function openState(schedule: WeeklySlot[], closures: { date: string; reason: string }[], now = new Date()): OpenState {
  const q = quitoNow(now);
  const closedToday = closures.find((c) => c.date === q.date);
  const today = closedToday ? [] : schedule.filter((s) => s.weekday === q.weekday);
  const current = today.find((s) => toMin(s.startTime) <= q.minutes && q.minutes < toMin(s.endTime));
  if (current) return { open: true, text: `Abierta ahora, hasta las ${current.endTime}` };
  const laterToday = today.find((s) => q.minutes < toMin(s.startTime));
  if (laterToday) return { open: false, text: `Cerrada. Hoy abre a las ${laterToday.startTime}` };
  for (let i = 1; i <= 7; i++) {
    const wd = (q.weekday + i) % 7;
    const next = schedule.filter((s) => s.weekday === wd).sort((a, b) => toMin(a.startTime) - toMin(b.startTime))[0];
    if (next) return { open: false, text: `Cerrada. Abre ${i === 1 ? 'mañana' : `el ${WEEKDAY_LABELS[wd].toLowerCase()}`} a las ${next.startTime}` };
  }
  return { open: false, text: closedToday ? `Cerrada hoy: ${closedToday.reason}` : 'Cerrada' };
}

const SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Agrupa días con el mismo horario: "Lunes a viernes, 08:00 a 18:00" / "Sábado, 08:00 a 12:00". */
export function scheduleLines(schedule: WeeklySlot[]): string[] {
  const byHours = new Map<string, number[]>();
  for (const s of schedule) {
    const k = `${s.startTime} a ${s.endTime}`;
    byHours.set(k, [...(byHours.get(k) ?? []), s.weekday]);
  }
  return [...byHours.entries()].map(([hours, days]) => {
    const sorted = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const consecutive = sorted.length > 2 && sorted.every((d, i) => i === 0 || d === (sorted[i - 1] + 1) % 7);
    const label = consecutive ? `${WEEKDAY_LABELS[sorted[0]]} a ${WEEKDAY_LABELS[sorted.at(-1)!].toLowerCase()}` : sorted.map((d, i) => (i === 0 ? WEEKDAY_LABELS[d] : WEEKDAY_LABELS[d].toLowerCase())).join(', ').replace(/, ([^,]*)$/, ' y $1');
    return `${label}, de ${hours}`;
  });
}

/** "lun, mié y vie, 08:00 a 13:00" para la tabla de médicos. */
export function daysShort(weekdays: number[]): string {
  const sorted = [...new Set(weekdays)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => SHORT[d]);
  if (sorted.length === 5 && sorted[0] === 'lun' && sorted[4] === 'vie') return 'lunes a viernes';
  return sorted.join(', ').replace(/, ([^,]*)$/, ' y $1');
}
