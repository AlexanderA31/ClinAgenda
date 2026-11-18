import { BellRing, CalendarDays, ClipboardList, FileUp, Hourglass, KeyRound, LayoutDashboard, ListChecks, Server, ShieldCheck, Stethoscope, Building2, UserCog, Users } from 'lucide-react';
import type { Permission } from '@clinagenda/schemas';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  /** Sin permiso: lo ve cualquiera con sesión. */
  permission?: Permission;
  hint: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Navegación por permisos: cada persona ve solo lo que su rol le deja usar. */
export const NAV: NavGroup[] = [
  {
    label: 'Día a día',
    items: [
      { href: '/agenda', label: 'Agenda del día', icon: CalendarDays, hint: 'Ver y dar citas' },
      { href: '/citas', label: 'Buscar citas', icon: ListChecks, hint: 'Todas las citas con filtros' },
      { href: '/pacientes', label: 'Pacientes', icon: Users, hint: 'Buscar o registrar pacientes' },
      { href: '/recordatorios', label: 'Recordatorios', icon: BellRing, permission: 'recordatorios.gestionar', hint: 'Avisar las citas de mañana' },
      { href: '/lista-espera', label: 'Lista de espera', icon: Hourglass, permission: 'lista_espera.gestionar', hint: 'Pacientes que esperan un espacio' },
    ],
  },
  {
    label: 'Clínicas',
    items: [
      { href: '/panel', label: 'Panel', icon: LayoutDashboard, permission: 'panel.ver', hint: 'Cifras del mes' },
      { href: '/medicos', label: 'Médicos', icon: Stethoscope, hint: 'Horarios por clínica' },
      { href: '/clinicas', label: 'Clínicas', icon: Building2, hint: 'Horarios y cierres' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { href: '/usuarios', label: 'Usuarios', icon: UserCog, permission: 'usuarios.gestionar', hint: 'Cuentas, accesos y contraseñas' },
      { href: '/roles', label: 'Roles y permisos', icon: KeyRound, permission: 'roles.gestionar', hint: 'Qué puede hacer cada rol' },
      { href: '/auditoria', label: 'Bitácora', icon: ShieldCheck, permission: 'auditoria.ver', hint: 'Quién cambió qué' },
      { href: '/importar', label: 'Importar datos', icon: FileUp, permission: 'datos.importar', hint: 'Cargar archivos CSV' },
      { href: '/sistema', label: 'Sistema', icon: Server, permission: 'sistema.ver', hint: 'Respaldos y estado' },
    ],
  },
  { label: 'Usted', items: [{ href: '/cuenta', label: 'Mi cuenta', icon: ClipboardList, hint: 'Cambiar contraseña' }] },
];
