import { BellRing, CalendarDays, FileUp, LayoutDashboard, Server, ShieldCheck, Stethoscope, Building2, UserCog, Users } from 'lucide-react';
import type { Permission } from '@clinagenda/schemas';

export interface NavLink {
  href: string;
  label: string;
  /** Sin permiso: lo ve cualquiera con sesión. */
  permission?: Permission;
  /** Fuera de la aplicación (se abre en otra pestaña), como la documentación de la API. */
  external?: boolean;
  /** Solo se marca en su propia ruta, no en las de abajo (el "Inicio" del portal). */
  exact?: boolean;
}

/** Un menú: enlace directo, o con submenú cuando tiene `children`. */
export interface NavItem extends NavLink {
  icon: typeof CalendarDays;
  hint: string;
  children?: NavLink[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Navegación por permisos: cada persona ve solo lo que su rol le deja usar.
 * Solo pantallas: las acciones (nueva cita, registrar, agregar) están dentro de cada pantalla.
 */
export const NAV: NavGroup[] = [
  {
    label: 'Día a día',
    items: [
      {
        href: '/agenda',
        label: 'Citas',
        icon: CalendarDays,
        hint: 'Agenda, búsqueda y solicitudes',
        children: [
          { href: '/agenda', label: 'Agenda del día' },
          { href: '/citas', label: 'Buscar citas' },
          { href: '/lista-espera', label: 'Lista de espera', permission: 'lista_espera.gestionar' },
        ],
      },
      { href: '/pacientes', label: 'Pacientes', icon: Users, hint: 'Buscar o registrar' },
      { href: '/recordatorios', label: 'Recordatorios', icon: BellRing, permission: 'recordatorios.gestionar', hint: 'Avisar las citas de mañana' },
    ],
  },
  {
    label: 'Clínicas',
    items: [
      { href: '/panel', label: 'Panel', icon: LayoutDashboard, permission: 'panel.ver', hint: 'Cifras del mes' },
      { href: '/clinicas', label: 'Clínicas', icon: Building2, hint: 'Horarios, cierres y nuevas sedes' },
      { href: '/medicos', label: 'Médicos', icon: Stethoscope, hint: 'Horarios por clínica' },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        href: '/usuarios',
        label: 'Accesos',
        icon: UserCog,
        hint: 'Usuarios, roles y permisos',
        children: [
          { href: '/usuarios', label: 'Usuarios', permission: 'usuarios.gestionar' },
          { href: '/roles', label: 'Roles y permisos', permission: 'roles.gestionar' },
        ],
      },
      { href: '/auditoria', label: 'Bitácora', icon: ShieldCheck, permission: 'auditoria.ver', hint: 'Quién cambió qué' },
      { href: '/importar', label: 'Importar datos', icon: FileUp, permission: 'datos.importar', hint: 'Cargar archivos CSV' },
      {
        href: '/sistema',
        label: 'Sistema',
        icon: Server,
        permission: 'sistema.ver',
        hint: 'Respaldos, estado y API',
        children: [
          { href: '/sistema', label: 'Estado y respaldos' },
          { href: '/api/docs', label: 'Documentación de la API', external: true },
        ],
      },
    ],
  },
];
