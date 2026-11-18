import { z } from 'zod';
import { RoleSchema } from './enums';
import { PasswordSchema } from './auth';
import { cleaned } from './common';
import type { Permission } from './permissions';
import { PERSON_NAME_PATTERN, toTitleCaseName } from '../validators/text';

const fullName = cleaned(toTitleCaseName, z.string().min(3, 'Escriba el nombre completo.').max(120).regex(PERSON_NAME_PATTERN, 'El nombre solo puede tener letras y espacios.'));

export const UserCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._]{3,40}$/, 'El usuario debe tener de 3 a 40 letras o números, sin espacios ni tildes.'),
  fullName,
  roleId: z.string({ required_error: 'Elija un rol.' }).uuid('Elija un rol.'),
  password: PasswordSchema,
  doctorId: z.string().uuid().nullable().optional(),
  clinicId: z.string().uuid().nullable().optional(),
});
export type UserCreateInput = z.infer<typeof UserCreateSchema>;

export const UserUpdateSchema = z.object({
  fullName: fullName.optional(),
  roleId: z.string().uuid().optional(),
  active: z.boolean().optional(),
  clinicId: z.string().uuid().nullable().optional(),
  doctorId: z.string().uuid().nullable().optional(),
  resetPassword: PasswordSchema.optional(),
});
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;

export interface UserView {
  id: string;
  username: string;
  fullName: string;
  /** Alcance de datos del rol asignado. */
  role: z.infer<typeof RoleSchema>;
  roleId: string;
  roleName: string;
  permissions: Permission[];
  active: boolean;
  /** Bloqueado temporalmente por demasiados intentos fallidos. */
  lockedUntil: string | null;
  mustChangePassword: boolean;
  doctorId: string | null;
  clinicId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}
