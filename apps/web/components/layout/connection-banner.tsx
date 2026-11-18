'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { flushQueue, listPending, onQueueChange, type PendingAppointment } from '@/lib/offline-queue';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * Siempre visible cuando hay algo que la recepcionista debe saber:
 * no hay internet, o hay citas guardadas en este equipo que aún no llegaron al sistema.
 */
export function ConnectionBanner() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<PendingAppointment[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => void listPending().then(setPending), []);

  const sync = useCallback(async () => {
    setSyncing(true);
    const { sent, conflicts } = await flushQueue();
    setSyncing(false);
    if (sent) {
      toast.success(sent === 1 ? 'Se envió 1 cita que estaba pendiente.' : `Se enviaron ${sent} citas que estaban pendientes.`);
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
    }
    if (conflicts) toast.error(`${conflicts} cita(s) no se pudieron guardar porque el horario ya estaba ocupado. Revíselas en la agenda.`);
  }, [qc]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const off = onQueueChange(refresh);
    if (navigator.onLine) void sync();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      off();
    };
  }, [refresh, sync]);

  const waiting = pending.filter((p) => p.status === 'PENDING').length;
  const conflicts = pending.filter((p) => p.status === 'CONFLICT').length;
  if (online && !waiting && !conflicts) return null;

  return (
    <div className="flex flex-col gap-2 border-b-2 border-warn/50 bg-warn-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        {online ? <TriangleAlert className="mt-0.5 size-6 shrink-0 text-warn" aria-hidden /> : <CloudOff className="mt-0.5 size-6 shrink-0 text-warn" aria-hidden />}
        <div>
          <p className="font-bold">{online ? 'Hay citas por revisar' : 'Sin internet'}</p>
          <p className="text-ink-2">
            {!online && 'Puede seguir viendo la agenda guardada y anotar citas: quedan en este equipo y se envían solas al volver la conexión. '}
            {waiting > 0 && `${waiting} cita(s) pendiente(s) de enviar — todavía NO están confirmadas. `}
            {conflicts > 0 && `${conflicts} cita(s) no se pudieron guardar porque el horario se ocupó.`}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {conflicts > 0 && (
          <Button asChild variant="secondary" size="sm">
            <Link href="/agenda?pendientes=1">Revisar</Link>
          </Button>
        )}
        {online && waiting > 0 && (
          <Button size="sm" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw className={syncing ? 'animate-spin' : ''} /> Enviar ahora
          </Button>
        )}
      </div>
    </div>
  );
}
