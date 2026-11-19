import { z } from 'zod';
import { RoleSchema } from './enums';
import { PasswordSchema } from './auth';
import { IsoDateTimeSchema, cleaned } from './common';
import { PermissionSchema } from './permissions';
import { PERSON_NAME_PATTERN, toTitleCaseName } from '../validators/text';

/** Clínicas donde trabaja una persona (por ejemplo, dónde hace recepción). Ninguna: todas. Sin repetidas. */
const ClinicIdsSchema = z
  .array(z.string().uuid('Clínica no válida.'))
  .max(100)
  .transform((ids) => [...new Set(ids)]);

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
  clinicIds: ClinicIdsSchema.default([]),
});
export type UserCreateInput = z.infer<typeof UserCreateSchema>;

export const UserUpdateSchema = z.object({
  fullName: fullName.optional(),
  roleId: z.string().uuid().optional(),
  active: z.boolean().optional(),
  clinicIds: ClinicIdsSchema.optional(),
  doctorId: z.string().uuid().nullable().optional(),
  resetPassword: PasswordSchema.optional(),
});
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;

export const UserViewSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  fullName: z.string(),
  /** Alcance de datos del rol asignado. */
  role: RoleSchema,
  roleId: z.string().uuid(),
  roleName: z.string(),
  permissions: z.array(PermissionSchema),
  active: z.boolean(),
  /** Bloqueado temporalmente por demasiados intentos fallidos. */
  lockedUntil: IsoDateTimeSchema.nullable(),
  mustChangePassword: z.boolean(),
  doctorId: z.string().uuid().nullable(),
  /** Clínicas donde trabaja; vacío: todas. */
  clinicIds: z.array(z.string().uuid()),
  lastLoginAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type UserView = z.infer<typeof UserViewSchema>;

/** Lo que cada persona puede cambiar de sí misma: solo su nombre. El rol y la clínica los decide la dirección. */
export const MyProfileUpdateSchema = z.object({ fullName });
export type MyProfileUpdateInput = z.infer<typeof MyProfileUpdateSchema>;

/** "Mi usuario": datos de la propia cuenta. */
export const MyProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  fullName: z.string(),
  roleName: z.string(),
  /** Nombres de sus clínicas de trabajo; vacío: todas. */
  clinicNames: z.array(z.string()),
  doctorName: z.string().nullable(),
  lastLoginAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type MyProfile = z.infer<typeof MyProfileSchema>;
