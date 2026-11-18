import { z } from 'zod';
import { RoleSchema } from './enums';

export const LoginSchema = z.object({
  username: z
    .string({ required_error: 'Escriba su usuario.' })
    .trim()
    .toLowerCase()
    .min(1, 'Escriba su usuario.')
    .max(40),
  password: z.string({ required_error: 'Escriba su contraseña.' }).min(1, 'Escriba su contraseña.').max(200),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const PasswordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(200)
  .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, 'La contraseña debe tener al menos una letra.')
  .regex(/\d/, 'La contraseña debe tener al menos un número.');

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Escriba su contraseña actual.'),
  newPassword: PasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const SessionUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  fullName: z.string(),
  role: RoleSchema,
  doctorId: z.string().uuid().nullable(),
  clinicId: z.string().uuid().nullable(),
  mustChangePassword: z.boolean(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;
