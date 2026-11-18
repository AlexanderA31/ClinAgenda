'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { NAV, type NavLink } from './nav';
import { ConnectionBanner } from './connection-banner';
import { BackupAlert } from './backup-status';
import { MyAccountDialog } from './my-account-dialog';
import { QueryAction } from './query-action';
import { NotificationBell } from './notification-bell';
import { ShellFrame, initialsOf } from './shell-frame';

/** Al llegar un aviso se recargan las citas: así la solicitud nueva aparece en la agenda sin recargar. */
const STAFF_REFRESH = ['appointments'] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [account, setAccount] = useState(false);
  // Cada persona ve solo lo que su rol le deja usar; un menú sin opciones permitidas no se muestra.
  const allowed = (l: NavLink) => !l.permission || user.permissions.includes(l.permission);
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter(allowed).flatMap((n) => {
      if (!n.children) return [n];
      const children = n.children.filter(allowed);
      return children.length ? [{ ...n, children }] : [];
    }),
  })).filter((g) => g.items.length);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    // Borra la copia de datos de pacientes guardada para uso sin internet.
    navigator.serviceWorker?.controller?.postMessage('logout');
    qc.clear();
    router.replace('/ingresar');
  };

  return (
    <>
      <ShellFrame
        home="/agenda"
        brand="ClinAgenda"
        brandShort="CA"
        groups={groups}
        account={
          <button
            type="button"
            onClick={() => setAccount(true)}
            aria-haspopup="dialog"
            aria-label={`Mi usuario: ${user.fullName}, ${user.roleName}`}
            className="flex min-h-12 items-center gap-3 rounded-md px-2 text-left hover:bg-surface-2"
            title="Mi usuario: mis datos y contraseña"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ballpoint-soft font-bold text-ballpoint" aria-hidden>
              {initialsOf(user.fullName)}
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="font-bold">{user.fullName}</span>
              <span className="text-sm text-ink-3">{user.roleName}</span>
            </span>
            <ChevronDown className="size-4 text-ink-3" aria-hidden />
          </button>
        }
        actions={
          <>
            <NotificationBell base="/notifications" refresh={STAFF_REFRESH} />
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut /> Salir
            </Button>
          </>
        }
        banners={
          <>
            <ConnectionBanner />
            <BackupAlert />
          </>
        }
      >
        {children}
      </ShellFrame>
      <MyAccountDialog open={account} onOpenChange={setAccount} />
      {/* /cuenta y los enlaces antiguos llegan con ?cuenta=1: se abre el modal "Mi usuario". */}
      <QueryAction name="cuenta" onMatch={() => setAccount(true)} />
    </>
  );
}
