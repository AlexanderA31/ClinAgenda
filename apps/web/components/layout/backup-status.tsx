'use client';

import { useQuery } from '@tanstack/react-query';
import { DatabaseBackup } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Notice } from '@/components/ui/misc';

interface BackupStatus {
  state: 'OK' | 'SIN_COPIA_EXTERNA' | 'ATRASADO' | 'FALLO' | 'DESCONOCIDO';
  message: string;
  lastAt: string | null;
}

function useBackupStatus(enabled: boolean) {
  return useQuery({ queryKey: ['system', 'backup'], queryFn: () => api<BackupStatus>('/system/backup'), enabled, refetchInterval: 30 * 60_000, retry: false });
}

/** Aviso en todas las pantallas de la dirección cuando el respaldo no está bien. Si está bien, no molesta. */
export function BackupAlert() {
  const user = useSession();
  const status = useBackupStatus(user.permissions.includes('sistema.ver'));
  if (!status.data || status.data.state === 'OK') return null;
  return (
    <div className="border-b-2 border-redpen/40 bg-redpen-soft px-4 py-3" role="alert">
      <p className="flex items-start gap-3">
        <DatabaseBackup className="mt-0.5 size-6 shrink-0 text-redpen" aria-hidden />
        <span>
          <strong>Respaldos: </strong>
          {status.data.message}
        </span>
      </p>
    </div>
  );
}

/** Línea de estado para el panel: también confirma cuando todo está bien. */
export function BackupLine() {
  const status = useBackupStatus(true);
  if (!status.data) return null;
  const ok = status.data.state === 'OK';
  return (
    <Notice tone={ok ? 'good' : 'danger'} title={ok ? 'Respaldos al día' : 'Revise los respaldos'}>
      {status.data.message}
      {status.data.lastAt && ` Último: ${dateTime(status.data.lastAt)}.`}
    </Notice>
  );
}
