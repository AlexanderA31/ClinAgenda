import { CalendarDays, ClipboardList, FileUp, Hourglass, LayoutDashboard, ListChecks, ShieldCheck, Stethoscope, Building2, UserCog, Users } from 'lucide-react';
import type { Role } from '@clinagenda/schemas';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  roles?: Role[];
  hint: string;
}

/** Navegación por rol: cada persona ve solo lo que usa. */
export const NAV: NavItem[] = [
  { href: '/agenda', label: 'Agenda del día', icon: CalendarDays, hint: 'Ver y dar citas' },
  { href: '/citas', label: 'Buscar citas', icon: ListChecks, hint: 'Todas las citas con filtros' },
  { href: '/pacientes', label: 'Pacientes', icon: Users, hint: 'Buscar o registrar pacientes' },
  { href: '/lista-espera', label: 'Lista de espera', icon: Hourglass, roles: ['ADMIN', 'RECEPCION'], hint: 'Pacientes que esperan un espacio' },
  { href: '/panel', label: 'Panel', icon: LayoutDashboard, roles: ['ADMIN', 'MEDICO'], hint: 'Cifras del mes' },
  { href: '/medicos', label: 'Médicos', icon: Stethoscope, hint: 'Horarios por clínica' },
  { href: '/clinicas', label: 'Clínicas', icon: Building2, hint: 'Horarios y cierres' },
  { href: '/usuarios', label: 'Usuarios', icon: UserCog, roles: ['ADMIN'], hint: 'Cuentas y contraseñas' },
  { href: '/importar', label: 'Importar datos', icon: FileUp, roles: ['ADMIN'], hint: 'Cargar archivos CSV' },
  { href: '/auditoria', label: 'Bitácora', icon: ShieldCheck, roles: ['ADMIN'], hint: 'Quién cambió qué' },
  { href: '/cuenta', label: 'Mi cuenta', icon: ClipboardList, hint: 'Cambiar contraseña' },
];
