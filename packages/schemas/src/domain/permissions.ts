import { z } from 'zod';
import { RoleSchema, type Role } from './enums';
import { cleaned, optionalCleanString } from './common';
import { cleanText } from '../validators/text';

/**
 * Lo que cada rol puede hacer. Ver la agenda, los pacientes, los médicos y las clínicas lo puede
 * cualquiera con sesión; los permisos cubren lo que cambia datos o muestra información delicada.
 * Los permisos son fijos (los define el sistema); los roles los arma la dirección.
 */
export const PERMISSIONS = [
  { key: 'citas.agendar', group: 'Citas', label: 'Dar, reprogramar, cancelar y recuperar citas' },
  { key: 'citas.estado', group: 'Citas', label: 'Marcar si el paciente asistió o no' },
  { key: 'citas.notas', group: 'Citas', label: 'Escribir notas clínicas (un médico, solo en sus citas)' },
  { key: 'recordatorios.gestionar', group: 'Citas', label: 'Enviar y marcar recordatorios' },
  { key: 'lista_espera.gestionar', group: 'Citas', label: 'Manejar la lista de espera' },
  { key: 'pacientes.editar', group: 'Pacientes', label: 'Registrar y corregir pacientes' },
  { key: 'pacientes.fusionar', group: 'Pacientes', label: 'Unir pacientes duplicados' },
  { key: 'panel.ver', group: 'Información', label: 'Ver el panel de cifras' },
  { key: 'medicos.gestionar', group: 'Clínicas y médicos', label: 'Crear médicos y cambiar sus horarios' },
  { key: 'clinicas.gestionar', group: 'Clínicas y médicos', label: 'Cambiar horarios y cierres de las clínicas' },
  { key: 'usuarios.gestionar', group: 'Administración', label: 'Crear usuarios, cambiar contraseñas y bloquear accesos' },
  { key: 'roles.gestionar', group: 'Administración', label: 'Crear roles y decidir sus permisos' },
  { key: 'auditoria.ver', group: 'Administración', label: 'Ver la bitácora de cambios' },
  { key: 'datos.importar', group: 'Administración', label: 'Importar datos desde archivos' },
  { key: 'sistema.ver', group: 'Administración', label: 'Ver el estado del sistema y los respaldos' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as [Permission, ...Permission[]];
export const PermissionSchema = z.enum(PERMISSION_KEYS);

/** Los tres roles de fábrica. Tienen id fijo para que la migración y el seed los encuentren. */
export const SYSTEM_ROLE_IDS = {
  ADMIN: '00000000-0000-4000-8000-000000000001',
  RECEPCION: '00000000-0000-4000-8000-000000000002',
  MEDICO: '00000000-0000-4000-8000-000000000003',
} as const satisfies Record<Role, string>;

/**
 * El alcance decide QUÉ datos ve una persona; los permisos, QUÉ puede hacer con ellos.
 * - ADMIN: toda la información, incluidas las notas clínicas.
 * - RECEPCION: todas las agendas y pacientes, sin notas clínicas.
 * - MEDICO: solo su propia agenda y sus pacientes; necesita estar vinculado a su ficha de médico.
 */
export const SCOPE_LABELS: Record<Role, { label: string; hint: string }> = {
  ADMIN: { label: 'Toda la información', hint: 'Ve todas las agendas, pacientes y notas clínicas.' },
  RECEPCION: { label: 'Recepción', hint: 'Ve todas las agendas y pacientes, pero no las notas clínicas.' },
  MEDICO: { label: 'Solo su agenda', hint: 'Ve únicamente sus citas y sus pacientes. Se vincula a una ficha de médico.' },
};

const roleName = cleaned(cleanText, z.string().min(3, 'Escriba un nombre de al menos 3 letras.').max(60, 'Máximo 60 caracteres.'));

export const RoleCreateSchema = z.object({
  name: roleName,
  description: optionalCleanString(200, 'La descripción').optional(),
  scope: RoleSchema,
  permissions: z.array(PermissionSchema).max(PERMISSION_KEYS.length),
});
export type RoleCreateInput = z.infer<typeof RoleCreateSchema>;

/** El alcance no se cambia después de crear el rol: cambiaría qué datos ven personas que ya lo usan. */
export const RoleUpdateSchema = RoleCreateSchema.omit({ scope: true }).partial();
export type RoleUpdateInput = z.infer<typeof RoleUpdateSchema>;

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  scope: Role;
  permissions: Permission[];
  system: boolean;
  /** La dirección siempre tiene todos los permisos: así nadie puede dejar el sistema sin administrador. */
  locked: boolean;
  userCount: number;
  createdAt: string;
}

/** Estado general para la pantalla "Sistema" del administrador. */
export interface SystemStatus {
  appVersion: string;
  startedAt: string;
  database: { version: string; bytes: number; lastMigration: string | null };
  users: { active: number; inactive: number; locked: number; pendingPassword: number };
  roles: number;
  patients: number;
  appointments: { total: number; upcoming: number };
  activity: { changes24h: number; failedLogins24h: number };
}
