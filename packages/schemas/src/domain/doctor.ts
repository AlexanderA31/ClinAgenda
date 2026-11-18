import { z } from 'zod';
import { WeeklySlotSchema, slotsOverlap } from './clinic';
import { cleaned } from './common';
import { PERSON_NAME_PATTERN, cleanText, toTitleCaseName } from '../validators/text';
import { checkPhone } from '../validators/phone';

/** Horario semanal de un médico en una clínica concreta. */
export const DoctorAssignmentSchema = WeeklySlotSchema.innerType().extend({
  clinicId: z.string().uuid('Elija una clínica.'),
});
export type DoctorAssignmentInput = z.infer<typeof DoctorAssignmentSchema>;

export const DoctorCreateSchema = z
  .object({
    fullName: cleaned(
      toTitleCaseName,
      z
        .string({ required_error: 'Escriba el nombre del médico.' })
        .min(5, 'Escriba nombre y apellido del médico.')
        .max(120)
        .regex(PERSON_NAME_PATTERN, 'El nombre solo puede tener letras y espacios.'),
    ),
    specialty: cleaned(cleanText, z.string({ required_error: 'Escriba la especialidad.' }).min(3, 'Escriba la especialidad.').max(80)),
    phone: z
      .string()
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (!v || !v.trim()) return null;
        const r = checkPhone(v);
        if (!r.ok) {
          ctx.addIssue({ code: 'custom', message: r.message });
          return z.NEVER;
        }
        return r.e164;
      }),
    assignments: z.array(DoctorAssignmentSchema).default([]),
  })
  .superRefine((v, ctx) => {
    // Un médico no puede estar en dos clínicas (ni dos veces en la misma) a la misma hora.
    v.assignments.forEach((a, i) => {
      v.assignments.slice(i + 1).forEach((b, j) => {
        if (slotsOverlap(a, b)) {
          ctx.addIssue({
            code: 'custom',
            path: ['assignments', i + 1 + j],
            message:
              a.clinicId === b.clinicId
                ? 'Este horario se repite con otro del mismo día en la misma clínica.'
                : 'El médico ya atiende en otra clínica a esa hora. Una persona no puede estar en dos lugares a la vez.',
          });
        }
      });
    });
  });
export type DoctorCreateInput = z.infer<typeof DoctorCreateSchema>;

export const DoctorUpdateSchema = DoctorCreateSchema.innerType().partial().extend({ active: z.boolean().optional() });
export type DoctorUpdateInput = z.infer<typeof DoctorUpdateSchema>;

export const DoctorViewSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  specialty: z.string(),
  phone: z.string().nullable(),
  active: z.boolean(),
  assignments: z.array(DoctorAssignmentSchema.extend({ id: z.string().uuid(), clinicName: z.string() })),
});
export type DoctorView = z.infer<typeof DoctorViewSchema>;
