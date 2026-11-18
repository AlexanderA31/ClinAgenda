'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ExternalLink, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { NAV, type NavItem, type NavLink } from './nav';
import { ConnectionBanner } from './connection-banner';
import { BackupAlert } from './backup-status';
import { MyAccountDialog } from './my-account-dialog';
import { QueryAction } from './query-action';
import { NotificationBell } from './notification-bell';

/** ¿Este enlace es la pantalla actual? Los que llevan `?accion=1` abren algo, no son una pantalla. */
const isHere = (pathname: string, href: string) => !href.includes('?') && (pathname === href || pathname.startsWith(href + '/'));

function NavList({ collapsed = false, onNavigate, onExpand }: { collapsed?: boolean; onNavigate?: () => void; onExpand?: () => void }) {
  const user = useSession();
  const pathname = usePathname();
  const allowed = (l: NavLink) => !l.permission || user.permissions.includes(l.permission);
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter(allowed).flatMap((n) => {
      if (!n.children) return [n];
      const children = n.children.filter(allowed);
      return children.length ? [{ ...n, children }] : [];
    }),
  })).filter((g) => g.items.length);
  const activeMenu = (n: NavItem) => (n.children ? n.children.some((c) => isHere(pathname, c.href)) : isHere(pathname, n.href));
  // Abierto el menú de la pantalla actual; el resto, como lo dejó la persona.
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.flatMap((g) => g.items.filter((n) => n.children && activeMenu(n)).map((n) => n.label))));
  useEffect(() => {
    const here = groups.flatMap((g) => g.items).find((n) => n.children && activeMenu(n));
    if (here) setOpen((o) => (o.has(here.label) ? o : new Set(o).add(here.label)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const toggle = (label: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const row = (active: boolean) =>
    cn(
      'flex min-h-12 w-full items-center gap-3 rounded-md font-bold transition-colors',
      collapsed ? 'justify-center px-0' : 'px-3 text-left',
      active ? 'bg-ballpoint text-ballpoint-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    );
  const label = (n: NavItem, active: boolean) =>
    !collapsed && (
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        {n.label}
        <span className={cn('text-xs font-normal', active ? 'opacity-80' : 'text-ink-3')}>{n.hint}</span>
      </span>
    );

  return (
    <nav aria-label="Secciones" className={cn('flex flex-col', collapsed ? 'gap-3' : 'gap-5')}>
      {groups.map((group, gi) => (
        <div key={group.label} className="flex flex-col gap-1">
          {collapsed ? gi > 0 && <hr className="mx-2 mb-2 border-rule" aria-hidden /> : <p className="px-3 pb-1 text-sm font-bold text-ink-3">{group.label}</p>}
          <ul className="flex flex-col gap-1">
            {group.items.map((n) => {
              const active = activeMenu(n);
              if (!n.children) {
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      aria-label={collapsed ? n.label : undefined}
                      title={collapsed ? `${n.label}: ${n.hint}` : undefined}
                      className={row(active)}
                    >
                      <n.icon className="size-5 shrink-0" aria-hidden />
                      {label(n, active)}
                    </Link>
                  </li>
                );
              }
              const isOpen = open.has(n.label) && !collapsed;
              const id = `submenu-${n.label.toLowerCase().replace(/\W+/g, '-')}`;
              return (
                <li key={n.label}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={collapsed ? undefined : id}
                    aria-label={collapsed ? `${n.label}: abrir submenú` : undefined}
                    title={collapsed ? `${n.label}: ${n.hint}` : undefined}
                    // Contraído no hay espacio para el submenú: se expande el menú y se abre este.
                    onClick={() => (collapsed ? (setOpen((o) => new Set(o).add(n.label)), onExpand?.()) : toggle(n.label))}
                    className={row(active && !isOpen)}
                  >
                    <n.icon className="size-5 shrink-0" aria-hidden />
                    {label(n, active && !isOpen)}
                    {!collapsed && <ChevronDown className={cn('size-4 shrink-0 transition-transform motion-reduce:transition-none', isOpen && 'rotate-180')} aria-hidden />}
                  </button>
                  {isOpen && (
                    <ul id={id} className="ml-[1.4rem] mt-1 flex flex-col gap-0.5 border-l-2 border-rule pl-3">
                      {n.children.map((c) => {
                        const here = isHere(pathname, c.href);
                        const cls = cn(
                          'flex min-h-11 items-center gap-2 rounded-md px-3 text-[0.95rem]',
                          here ? 'bg-ballpoint text-ballpoint-ink font-bold' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                        );
                        return (
                          <li key={c.href}>
                            {c.external ? (
                              <a href={c.href} target="_blank" rel="noreferrer" className={cls}>
                                {c.label} <ExternalLink className="size-3.5 opacity-70" aria-hidden />
                                <span className="sr-only">(se abre en otra pestaña)</span>
                              </a>
                            ) : (
                              <Link href={c.href} onClick={onNavigate} aria-current={here ? 'page' : undefined} className={cls}>
                                {c.href.includes('?') && <Plus className="size-4 shrink-0" aria-hidden />}
                                {c.label}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const SIDEBAR_KEY = 'ca-sidebar';
/** Al llegar un aviso se recargan las citas: así la solicitud nueva aparece en la agenda sin recargar. */
const STAFF_REFRESH = ['appointments'] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(false);
  // Menú lateral contraído (solo íconos): se recuerda en este equipo.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === 'contraido');
    } catch {}
  }, []);
  const setSidebar = (c: boolean) => {
    setCollapsed(c);
    try {
      localStorage.setItem(SIDEBAR_KEY, c ? 'contraido' : 'abierto');
    } catch {}
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    // Borra la copia de datos de pacientes guardada para uso sin internet.
    navigator.serviceWorker?.controller?.postMessage('logout');
    qc.clear();
    router.replace('/ingresar');
  };

  return (
    <div className="flex min-h-dvh">
      <aside
        aria-label="Menú principal"
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 overflow-y-auto border-r border-rule bg-surface py-5 transition-[width] duration-200 motion-reduce:transition-none lg:flex',
          collapsed ? 'w-20 px-3' : 'w-72 px-4',
        )}
      >
        <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between')}>
          <Link href="/agenda" className="font-display text-2xl font-extrabold text-ballpoint" aria-label="ClinAgenda: ir a la agenda">
            {collapsed ? 'CA' : 'ClinAgenda'}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebar(!collapsed)}
            aria-label={collapsed ? 'Expandir el menú' : 'Contraer el menú'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expandir el menú' : 'Contraer el menú'}
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </Button>
        </div>
        <NavList collapsed={collapsed} onExpand={() => setSidebar(false)} />
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
            <NotificationBell base="/notifications" refresh={STAFF_REFRESH} />
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
      {/* /cuenta y los enlaces antiguos llegan con ?cuenta=1: se abre el modal "Mi usuario". */}
      <QueryAction name="cuenta" onMatch={() => setAccount(true)} />
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
