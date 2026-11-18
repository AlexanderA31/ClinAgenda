import { z } from 'zod';
import { IsoDaySchema } from './common';

export const ReportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clinicId: z.string().uuid().optional(),
});
export type ReportQuery = z.infer<typeof ReportQuerySchema>;

const count = z.number().int();
export const DashboardReportSchema = z.object({
  range: z.object({ from: IsoDaySchema, to: IsoDaySchema }),
  totals: z.object({ scheduled: count, attended: count, noShow: count, cancelled: count, patientsNew: count }),
  /** Una fila por día: conteo por estado. */
  daily: z.array(z.object({ date: IsoDaySchema, scheduled: count, attended: count, noShow: count, cancelled: count })),
  byClinic: z.array(z.object({ clinicId: z.string().uuid(), clinicName: z.string(), appointments: count, capacity: count, occupancy: z.number() })),
  byDoctor: z.array(z.object({ doctorId: z.string().uuid(), doctorName: z.string(), appointments: count, noShow: count })),
  cancelReasons: z.array(z.object({ reason: z.string(), count })),
  /** Citas por hora local del día (7..19), para ver horas pico. */
  byHour: z.array(z.object({ hour: z.number().int(), count })),
});
export type DashboardReport = z.infer<typeof DashboardReportSchema>;
