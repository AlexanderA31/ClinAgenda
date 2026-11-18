'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, LogOut, Menu } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { NAV } from './nav';
import { ConnectionBanner } from './connection-banner';
import { BackupAlert } from './backup-status';
import { MyAccountDialog } from './my-account-dialog';

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const user = useSession();
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="flex flex-col gap-5">
      {NAV.map((group) => {
        const items = group.items.filter((n) => !n.permission || user.permissions.includes(n.permission));
        if (!items.length) return null;
        return (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-sm font-bold text-ink-3">{group.label}</p>
            <ul className="flex flex-col gap-1">
              {items.map((n) => {
                const active = pathname === n.href || pathname.startsWith(n.href + '/');
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-12 items-center gap-3 rounded-md px-3 font-bold transition-colors',
                        active ? 'bg-ballpoint text-ballpoint-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      <n.icon className="size-5 shrink-0" aria-hidden />
                      <span className="flex flex-col leading-tight">
                        {n.label}
                        <span className={cn('text-xs font-normal', active ? 'opacity-80' : 'text-ink-3')}>{n.hint}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(false);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    // Borra la copia de datos de pacientes guardada para uso sin internet.
    navigator.serviceWorker?.controller?.postMessage('logout');
    qc.clear();
    router.replace('/ingresar');
  };

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r border-rule bg-surface px-4 py-5 lg:flex">
        <Link href="/agenda" className="font-display text-2xl font-extrabold text-ballpoint">
          ClinAgenda
        </Link>
        <NavList />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface/95 px-4 py-2 backdrop-blur"
          style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}
        >
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
              <Menu className="size-6" />
            </Button>
            <button
              type="button"
              onClick={() => setAccount(true)}
              aria-haspopup="dialog"
              aria-label={`Mi usuario: ${user.fullName}, ${user.roleName}`}
              className="flex min-h-12 items-center gap-3 rounded-md px-2 text-left hover:bg-surface-2"
              title="Mi usuario: mis datos y contraseña"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ballpoint-soft font-bold text-ballpoint" aria-hidden>
                {user.fullName
                  .split(/\s+/)
                  .filter((w) => /^\p{Lu}/u.test(w))
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join('')}
              </span>
              <span className="hidden flex-col leading-tight sm:flex">
                <span className="font-bold">{user.fullName}</span>
                <span className="text-sm text-ink-3">{user.roleName}</span>
              </span>
              <ChevronDown className="size-4 text-ink-3" aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut /> Salir
            </Button>
          </div>
        </header>
        <ConnectionBanner />
        <BackupAlert />
        <main className="flex-1 pb-28 pt-6" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
        </main>
      </div>

      <MyAccountDialog open={account} onOpenChange={setAccount} />
      <Suspense fallback={null}>
        <OpenAccountFromQuery onOpen={() => setAccount(true)} />
      </Suspense>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side title="Menú">
          <div className="flex flex-col gap-6">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** /cuenta y los enlaces antiguos llegan con ?cuenta=1: se abre el modal "Mi usuario". */
function OpenAccountFromQuery({ onOpen }: { onOpen: () => void }) {
  const params = useSearchParams();
  const wants = !!params.get('cuenta');
  // Solo cuando aparece el parámetro: cerrar el modal no debe volver a abrirlo en el siguiente render.
  const [handled, setHandled] = useState(false);
  useEffect(() => {
    if (wants && !handled) {
      setHandled(true);
      onOpen();
    }
  }, [wants, handled, onOpen]);
  return null;
}
