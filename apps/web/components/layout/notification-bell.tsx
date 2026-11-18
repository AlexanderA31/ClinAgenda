'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarCheck, CalendarClock, CalendarPlus, CalendarX, CheckCheck, Inbox, RotateCcw, UserX } from 'lucide-react';
import { toast } from 'sonner';
import type { NotificationKind, NotificationList, NotificationView } from '@clinagenda/schemas';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICONS: Record<NotificationKind, { icon: typeof Bell; tone: string }> = {
  CITA_AGENDADA: { icon: CalendarPlus, tone: 'bg-ballpoint-soft text-ballpoint' },
  CITA_ACEPTADA: { icon: CalendarCheck, tone: 'bg-good-soft text-good' },
  CITA_RECHAZADA: { icon: CalendarX, tone: 'bg-redpen-soft text-redpen' },
  CITA_MOVIDA: { icon: CalendarClock, tone: 'bg-warn-soft text-warn' },
  CITA_CANCELADA: { icon: CalendarX, tone: 'bg-redpen-soft text-redpen' },
  CITA_REACTIVADA: { icon: RotateCcw, tone: 'bg-good-soft text-good' },
  SOLICITUD_NUEVA: { icon: CalendarPlus, tone: 'bg-warn-soft text-warn' },
  CANCELADA_POR_PACIENTE: { icon: UserX, tone: 'bg-redpen-soft text-redpen' },
};

/** "Hace 5 min", "hace 2 h"; después de un día, la fecha. */
function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  if (min < 24 * 60) return `Hace ${Math.round(min / 60)} h`;
  return dateTime(iso);
}

/**
 * Campana de avisos internos (personal o paciente). Revisa cada 30 segundos; si llega algo nuevo
 * muestra un aviso emergente y actualiza `refresh` (por ejemplo, la agenda o "Mis citas").
 */
export function NotificationBell({ base, refresh, variant = 'app' }: { base: '/notifications' | '/portal/notifications'; refresh: readonly unknown[]; variant?: 'app' | 'portal' }) {
  const qc = useQueryClient();
  const router = useRouter();
  const key = ['notifications', base];
  const list = useQuery({ queryKey: key, queryFn: () => api<NotificationList>(base), refetchInterval: 30_000 });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);

  // Lo nuevo desde la última revisión: aviso emergente y datos frescos en pantalla.
  useEffect(() => {
    if (!list.data) return;
    const ids = new Set(list.data.items.map((n) => n.id));
    if (seen.current) {
      const fresh = list.data.items.filter((n) => !n.read && !seen.current!.has(n.id));
      if (fresh.length) {
        void qc.invalidateQueries({ queryKey: refresh });
        const n = fresh[0];
        toast(n.title, { description: fresh.length > 1 ? `${n.body} (y ${fresh.length - 1} aviso(s) más)` : n.body, action: n.link ? { label: 'Ver', onClick: () => router.push(n.link!) } : undefined, duration: 10000 });
      }
    }
    seen.current = ids;
  }, [list.data, qc, refresh, router]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const save = (data: NotificationList) => qc.setQueryData(key, data);
  const readOne = useMutation({ mutationFn: (id: string) => api<NotificationList>(`${base}/${id}/read`, { method: 'POST' }), onSuccess: save });
  const readAll = useMutation({ mutationFn: () => api<NotificationList>(`${base}/read-all`, { method: 'POST' }), onSuccess: save });
  const go = (n: NotificationView) => {
    if (!n.read) readOne.mutate(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const unread = list.data?.unread ?? 0;
  const items = list.data?.items ?? [];
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread ? `Avisos: ${unread} sin leer` : 'Avisos'}
        title="Avisos"
        className={cn(
          'relative grid size-11 place-items-center rounded-full',
          variant === 'portal' ? 'text-[var(--hero-ink)] hover:bg-white/10' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )}
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="tabular absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-redpen px-1 text-xs font-bold leading-5 text-white" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Avisos"
          className="fixed inset-x-4 top-16 z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-xl border border-rule bg-surface text-ink shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <p className="font-display text-lg font-bold">Avisos</p>
            {unread > 0 && (
              <button type="button" onClick={() => readAll.mutate()} className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm font-bold text-ballpoint hover:bg-ballpoint-soft">
                <CheckCheck className="size-4" aria-hidden /> Marcar todo leído
              </button>
            )}
          </div>
          {items.length ? (
            <ul className="flex-1 divide-y divide-rule overflow-y-auto">
              {items.map((n) => {
                const { icon: Icon, tone } = ICONS[n.kind] ?? { icon: Bell, tone: 'bg-surface-2 text-ink-2' };
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => go(n)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2', !n.read && 'bg-ballpoint-soft/40')}>
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', tone)} aria-hidden>
                        <Icon className="size-4" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={cn('leading-tight', n.read ? 'font-normal' : 'font-bold')}>{n.title}</span>
                        <span className="text-sm text-ink-2">{n.body}</span>
                        <span className="text-xs text-ink-3">{ago(n.createdAt)}</span>
                      </span>
                      {!n.read && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-ballpoint" aria-label="Sin leer" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-ink-2">
              <Inbox className="size-8 text-ink-3" aria-hidden />
              <p>{list.isPending ? 'Cargando…' : 'No tiene avisos todavía.'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
