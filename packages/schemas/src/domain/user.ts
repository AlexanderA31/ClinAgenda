import { z } from 'zod';
import { RoleSchema } from './enums';
import { PasswordSchema } from './auth';
import { PERSON_NAME_PATTERN, toTitleCaseName } from '../validators/text';

export const UserCreateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._]{3,40}$/, 'El usuario debe tener de 3 a 40 letras o números, sin espacios ni tildes.'),
    fullName: z
      .string()
      .transform(toTitleCaseName)
      .pipe(z.string().min(3, 'Escriba el nombre completo.').max(120).regex(PERSON_NAME_PATTERN, 'El nombre solo puede tener letras y espacios.')),
    role: RoleSchema,
    password: PasswordSchema,
    doctorId: z.string().uuid().nullable().optional(),
    clinicId: z.string().uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'MEDICO' && !v.doctorId) {
      ctx.addIssue({ code: 'custom', path: ['doctorId'], message: 'Un usuario médico debe estar vinculado a su ficha de médico.' });
    }
  });
export type UserCreateInput = z.infer<typeof UserCreateSchema>;

export const UserUpdateSchema = z.object({
  fullName: z.string().transform(toTitleCaseName).pipe(z.string().min(3).max(120)).optional(),
  role: RoleSchema.optional(),
  active: z.boolean().optional(),
  clinicId: z.string().uuid().nullable().optional(),
  resetPassword: PasswordSchema.optional(),
});
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;

export interface UserView {
  id: string;
  username: string;
  fullName: string;
  role: z.infer<typeof RoleSchema>;
  active: boolean;
  doctorId: string | null;
  clinicId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}
