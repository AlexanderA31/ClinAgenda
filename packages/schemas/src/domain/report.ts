import { z } from 'zod';

export const ReportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clinicId: z.string().uuid().optional(),
});
export type ReportQuery = z.infer<typeof ReportQuerySchema>;

export interface DashboardReport {
  range: { from: string; to: string };
  totals: { scheduled: number; attended: number; noShow: number; cancelled: number; patientsNew: number };
  /** Una fila por día: conteo por estado. */
  daily: { date: string; scheduled: number; attended: number; noShow: number; cancelled: number }[];
  byClinic: { clinicId: string; clinicName: string; appointments: number; capacity: number; occupancy: number }[];
  byDoctor: { doctorId: string; doctorName: string; appointments: number; noShow: number }[];
  cancelReasons: { reason: string; count: number }[];
  /** Citas por hora local del día (7..19), para ver horas pico. */
  byHour: { hour: number; count: number }[];
}
