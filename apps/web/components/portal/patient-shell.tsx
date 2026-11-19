'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ClipboardList, Globe, History, Home, LogOut, UserRound } from 'lucide-react';
import type { PortalMe } from '@clinagenda/schemas';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { NavGroup } from '@/components/layout/nav';
import { NotificationBell } from '@/components/layout/notification-bell';
import { ShellFrame } from '@/components/layout/shell-frame';

export function usePortalMe() {
  return useQuery({ queryKey: ['portal', 'me'], queryFn: () => api<PortalMe>('/portal/me'), staleTime: 5 * 60_000 });
}

const PORTAL_REFRESH = ['portal', 'appointments'] as const;

/** El menú del paciente: lo mismo que antes estaba en la barra de arriba, ahora con el orden del panel del personal. */
const PATIENT_NAV: NavGroup[] = [
  {
    label: 'Mis citas',
    items: [
      { href: '/paciente', exact: true, label: 'Inicio', icon: Home, hint: 'Mi próxima cita' },
      { href: '/paciente/agendar', label: 'Agendar una cita', icon: CalendarPlus, hint: 'Clínica, médico y hora' },
      { href: '/paciente/historial', label: 'Historial', icon: History, hint: 'Citas y comprobantes' },
    ],
  },
  { label: 'Mi salud', items: [{ href: '/paciente/ficha', label: 'Mi ficha', icon: ClipboardList, hint: 'Diagnósticos, recetas y resultados' }] },
  { label: 'Mi cuenta', items: [{ href: '/paciente/perfil', label: 'Mi perfil', icon: UserRound, hint: 'Datos, contraseña y sesiones' }] },
  { label: 'Clínicas', items: [{ href: '/', label: 'Horarios y médicos', icon: Globe, hint: 'Página de las clínicas' }] },
];

/** Portal del paciente con el mismo marco que el panel del personal: menú lateral, cabecera, avisos. */
export function PatientShell({ children }: { children: React.ReactNode }) {
  const me = usePortalMe();
  const router = useRouter();
  const qc = useQueryClient();
  const logout = async () => {
    await api('/portal/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    router.replace('/');
  };
  const initials = me.data ? `${me.data.firstNames[0] ?? ''}${me.data.lastNames[0] ?? ''}`.toUpperCase() : '';

  return (
    <ShellFrame
      home="/paciente"
      brand="Clínicas Paredes"
      brandShort="CP"
      groups={PATIENT_NAV}
      account={
        <Link href="/paciente/perfil" className="flex min-h-12 items-center gap-3 rounded-md px-2 hover:bg-surface-2" title="Mi perfil: mis datos y contraseña">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ballpoint-soft font-bold text-ballpoint" aria-hidden>
            {initials}
          </span>
          {me.data && (
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="font-bold">
                {me.data.firstNames.split(' ')[0]} {me.data.lastNames.split(' ')[0]}
              </span>
              <span className="text-sm text-ink-3">Ficha {me.data.patientCode}</span>
            </span>
          )}
          <span className="sr-only">Mi perfil</span>
        </Link>
      }
      actions={
        <>
          <NotificationBell base="/portal/notifications" refresh={PORTAL_REFRESH} />
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut /> Salir
          </Button>
        </>
      }
    >
      {children}
    </ShellFrame>
  );
}
