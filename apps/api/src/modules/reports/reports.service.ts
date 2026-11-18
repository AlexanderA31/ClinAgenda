import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CANCEL_REASON_LABELS, type DashboardReport, type ReportQuery, type SessionUser } from '@clinagenda/schemas';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_TZ, hhmmToMinutes, rangeBoundsUtc, weekdayOf } from '../../common/utils/time';
import { DomainError } from '../../common/errors/domain-error';

const TZ = DEFAULT_TZ;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(q: ReportQuery, user: SessionUser): Promise<DashboardReport> {
    if (q.from > q.to) throw DomainError.validation('La fecha "desde" debe ser anterior a la fecha "hasta".');
    const days = DateTime.fromISO(q.to).diff(DateTime.fromISO(q.from), 'days').days + 1;
    if (days > 366) throw DomainError.validation('Elija un rango de hasta un año.');

    const { start, end } = rangeBoundsUtc(q.from, q.to, TZ);
    const doctorId = user.role === 'MEDICO' ? user.doctorId : null;
    const filters = [Prisma.sql`a."startsAt" >= ${start}`, Prisma.sql`a."startsAt" < ${end}`];
    if (q.clinicId) filters.push(Prisma.sql`a."clinicId" = ${q.clinicId}::uuid`);
    if (doctorId) filters.push(Prisma.sql`a."doctorId" = ${doctorId}::uuid`);
    const where = Prisma.join(filters, ' AND ');

    const [daily, byClinic, byDoctor, reasons, byHour, patientsNew] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; status: string; n: number }[]>`
        SELECT to_char(a."startsAt" AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS date, a.status::text AS status, count(*)::int AS n
        FROM "Appointment" a WHERE ${where} GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ clinicId: string; n: number }[]>`
        SELECT a."clinicId" AS "clinicId", count(*)::int AS n FROM "Appointment" a
        WHERE ${where} AND a.status <> 'CANCELLED' GROUP BY 1`,
      this.prisma.$queryRaw<{ doctorId: string; doctorName: string; n: number; noshow: number }[]>`
        SELECT d.id AS "doctorId", d."fullName" AS "doctorName",
               count(*) FILTER (WHERE a.status <> 'CANCELLED')::int AS n,
               count(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS noshow
        FROM "Appointment" a JOIN "Doctor" d ON d.id = a."doctorId"
        WHERE ${where} GROUP BY 1, 2 ORDER BY n DESC`,
      this.prisma.$queryRaw<{ reason: string; n: number }[]>`
        SELECT a."cancelReason"::text AS reason, count(*)::int AS n FROM "Appointment" a
        WHERE ${where} AND a.status = 'CANCELLED' GROUP BY 1 ORDER BY n DESC`,
      this.prisma.$queryRaw<{ hour: number; n: number }[]>`
        SELECT extract(hour FROM a."startsAt" AT TIME ZONE ${TZ})::int AS hour, count(*)::int AS n
        FROM "Appointment" a WHERE ${where} AND a.status <> 'CANCELLED' GROUP BY 1 ORDER BY 1`,
      this.prisma.patient.count({ where: { createdAt: { gte: start, lt: end }, mergedIntoId: null } }),
    ]);

    // Serie diaria completa (días sin citas aparecen en cero, no desaparecen del gráfico).
    const dailyMap = new Map<string, DashboardReport['daily'][number]>();
    for (let d = DateTime.fromISO(q.from); d <= DateTime.fromISO(q.to); d = d.plus({ days: 1 })) {
      const key = d.toISODate()!;
      dailyMap.set(key, { date: key, scheduled: 0, attended: 0, noShow: 0, cancelled: 0 });
    }
    const totals = { scheduled: 0, attended: 0, noShow: 0, cancelled: 0, patientsNew };
    for (const row of daily) {
      const bucket = dailyMap.get(row.date);
      const key = ({ REQUESTED: 'scheduled', SCHEDULED: 'scheduled', ATTENDED: 'attended', NO_SHOW: 'noShow', CANCELLED: 'cancelled' } as const)[row.status as 'SCHEDULED'];
      if (bucket && key) bucket[key] += row.n;
      if (key) totals[key] += row.n;
    }

    const clinics = await this.prisma.clinic.findMany({
      where: q.clinicId ? { id: q.clinicId } : undefined,
      include: { assignments: doctorId ? { where: { doctorId } } : true },
      orderBy: { name: 'asc' },
    });
    const clinicCounts = new Map(byClinic.map((r) => [r.clinicId, r.n]));
    const byClinicView = clinics.map((c) => {
      // Capacidad = cuántos turnos caben según los horarios de los médicos en esa clínica.
      let capacity = 0;
      for (let d = DateTime.fromISO(q.from, { zone: c.timezone }); d <= DateTime.fromISO(q.to, { zone: c.timezone }); d = d.plus({ days: 1 })) {
        const wd = weekdayOf(d);
        for (const a of c.assignments.filter((x) => x.weekday === wd)) {
          capacity += Math.floor((hhmmToMinutes(a.endTime) - hhmmToMinutes(a.startTime)) / c.slotMinutes);
        }
      }
      const appointments = clinicCounts.get(c.id) ?? 0;
      return { clinicId: c.id, clinicName: c.name, appointments, capacity, occupancy: capacity ? Math.min(1, appointments / capacity) : 0 };
    });

    const hours = new Map(byHour.map((h) => [h.hour, h.n]));
    return {
      range: { from: q.from, to: q.to },
      totals,
      daily: [...dailyMap.values()],
      byClinic: byClinicView,
      byDoctor: byDoctor.map((d) => ({ doctorId: d.doctorId, doctorName: d.doctorName, appointments: d.n, noShow: d.noshow })),
      cancelReasons: reasons.map((r) => ({ reason: CANCEL_REASON_LABELS[r.reason as keyof typeof CANCEL_REASON_LABELS] ?? 'Sin motivo', count: r.n })),
      byHour: Array.from({ length: 13 }, (_, i) => i + 7).map((hour) => ({ hour, count: hours.get(hour) ?? 0 })),
    };
  }
}
