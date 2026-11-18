'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ListChecks, LogOut } from 'lucide-react';
import type { PortalMe } from '@clinagenda/schemas';
import s from '@/components/landing/landing.module.css';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function usePortalMe() {
  return useQuery({ queryKey: ['portal', 'me'], queryFn: () => api<PortalMe>('/portal/me'), staleTime: 5 * 60_000 });
}

/** Cabecera del portal: la marca, "Mis citas", "Agendar" y salir. */
export function PortalHeader() {
  const me = usePortalMe();
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    await api('/portal/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/');
  };
  const link = (href: string, active: boolean) =>
    cn('flex min-h-11 items-center justify-center gap-2 rounded-full px-4 font-bold', active ? 'bg-[var(--maiz)] text-[var(--maiz-ink)]' : 'text-[var(--hero-ink)] opacity-85 hover:opacity-100');

  return (
    <header className={cn(s.hero, s.gutter, 'py-4')}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col leading-tight">
          <Link href="/" className="font-display text-2xl font-extrabold">
            Clínicas Paredes
          </Link>
          {me.data && <span className={cn(s.lede, 'text-sm')}>Hola, {me.data.firstNames.split(' ')[0]}</span>}
        </div>
        <nav aria-label="Portal del paciente" className="order-3 grid w-full grid-cols-2 gap-1 sm:order-none sm:flex sm:w-auto sm:items-center">
          <Link href="/paciente" className={link('/paciente', pathname === '/paciente')} aria-current={pathname === '/paciente' ? 'page' : undefined}>
            <ListChecks className="size-5" aria-hidden /> Mis citas
          </Link>
          <Link href="/paciente/agendar" className={link('/paciente/agendar', pathname === '/paciente/agendar')} aria-current={pathname === '/paciente/agendar' ? 'page' : undefined}>
            <CalendarPlus className="size-5" aria-hidden /> Agendar
          </Link>
          <button type="button" onClick={() => void logout()} className={cn(s.ghost, 'ml-1 hidden min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold sm:flex')}>
            <LogOut className="size-4" aria-hidden /> Salir
          </button>
        </nav>
        <button type="button" onClick={() => void logout()} className={cn(s.ghost, 'flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold sm:hidden')}>
          <LogOut className="size-4" aria-hidden /> Salir
        </button>
      </div>
    </header>
  );
}
