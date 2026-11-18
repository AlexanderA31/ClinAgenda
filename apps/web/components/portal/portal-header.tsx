'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Home, LogOut, UserRound } from 'lucide-react';
import type { PortalMe } from '@clinagenda/schemas';
import s from '@/components/landing/landing.module.css';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function usePortalMe() {
  return useQuery({ queryKey: ['portal', 'me'], queryFn: () => api<PortalMe>('/portal/me'), staleTime: 5 * 60_000 });
}

/** Cabecera del portal: la marca, "Mis citas", "Agendar" y salir. */
const LINKS = [
  { href: '/paciente', label: 'Inicio', icon: Home },
  { href: '/paciente/agendar', label: 'Agendar', icon: CalendarPlus },
  { href: '/paciente/perfil', label: 'Mi perfil', icon: UserRound },
];

/** Cabecera del portal: la marca, el saludo, Inicio, Agendar, Mi perfil y salir. */
export function PortalHeader() {
  const me = usePortalMe();
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    await api('/portal/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/');
  };
  const initials = me.data ? `${me.data.firstNames[0] ?? ''}${me.data.lastNames[0] ?? ''}`.toUpperCase() : '';

  return (
    <header className={cn(s.hero, s.gutter, 'py-3')}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <Link href="/" className="font-display text-2xl font-extrabold">
          Clínicas Paredes
        </Link>
        <nav aria-label="Portal del paciente" className="order-3 grid w-full grid-cols-3 gap-1 sm:order-none sm:flex sm:w-auto sm:items-center">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-sm font-bold sm:gap-2 sm:px-4 sm:text-base',
                  active ? 'bg-[var(--maiz)] text-[var(--maiz-ink)]' : 'text-[var(--hero-ink)] opacity-85 hover:opacity-100',
                )}
              >
                <Icon className="size-5" aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {me.data && (
            <Link href="/paciente/perfil" className="hidden items-center gap-2 lg:flex" title="Mi perfil">
              <span className="grid size-10 place-items-center rounded-full bg-[var(--maiz)] font-bold text-[var(--maiz-ink)]" aria-hidden>
                {initials}
              </span>
              <span className={cn(s.lede, 'text-sm leading-tight')}>
                {me.data.firstNames.split(' ')[0]}
                <span className="block opacity-80">Ficha {me.data.patientCode}</span>
              </span>
            </Link>
          )}
          <button type="button" onClick={() => void logout()} className={cn(s.ghost, 'flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold')}>
            <LogOut className="size-4" aria-hidden /> Salir
          </button>
        </div>
      </div>
    </header>
  );
}
