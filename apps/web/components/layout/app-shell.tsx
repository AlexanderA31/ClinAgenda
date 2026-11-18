'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS } from '@clinagenda/schemas';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { NAV } from './nav';
import { ConnectionBanner } from './connection-banner';
import { BackupAlert } from './backup-status';
import { Preferences } from './preferences';

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const user = useSession();
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones">
      <ul className="flex flex-col gap-1">
        {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) => {
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
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

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
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface/95 px-4 py-2 backdrop-blur" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
              <Menu className="size-6" />
            </Button>
            <div className="flex flex-col leading-tight">
              <span className="font-bold">{user.fullName}</span>
              <span className="text-sm text-ink-3">{ROLE_LABELS[user.role]}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Preferences className="hidden sm:flex" />
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut /> Salir
            </Button>
          </div>
        </header>
        <ConnectionBanner />
        <BackupAlert />
        <main className="flex-1 py-6" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
        </main>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side title="Menú">
          <div className="flex flex-col gap-6">
            <NavList onNavigate={() => setOpen(false)} />
            <Preferences />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
