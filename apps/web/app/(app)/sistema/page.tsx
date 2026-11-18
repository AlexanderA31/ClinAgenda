'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarClock, Database, FileText, KeyRound, Lock, ShieldAlert, ShieldCheck, UserCog, UserX, Users } from 'lucide-react';
import type { SystemStatus } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useCan } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Notice, PageHeader, Skeleton } from '@/components/ui/misc';
import { Stat, StatGrid } from '@/components/ui/stat';
import { BackupLine } from '@/components/layout/backup-status';
import { RequirePermission } from '@/components/layout/require-role';

export default function SystemPage() {
  return (
    <RequirePermission permission="sistema.ver">
      <System />
    </RequirePermission>
  );
}

function bytes(n: number) {
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const n = (v: number) => v.toLocaleString('es-EC');

function System() {
  const status = useQuery({ queryKey: ['system', 'status'], queryFn: () => api<SystemStatus>('/system/status'), refetchInterval: 60_000 });
  const canUsers = useCan('usuarios.gestionar');
  const canAudit = useCan('auditoria.ver');
  const s = status.data;

  return (
    <>
      <PageHeader title="Sistema" description="Lo que conviene revisar cada día: respaldos, accesos y la actividad del sistema. Se actualiza cada minuto." />
      <BackupLine />
      {status.isError && (
        <Notice tone="danger" title="No se pudo cargar el estado">
          {errorMessage(status.error)}
        </Notice>
      )}
      {!s ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <StatGrid>
            <Stat label="Usuarios activos" value={n(s.users.active)} icon={Users} tone="info" note={`${s.users.inactive} desactivados`} />
            <Stat label="Pacientes" value={n(s.patients)} icon={UserCog} tone="info" note="En las tres clínicas" />
            <Stat label="Citas por venir" value={n(s.appointments.upcoming)} icon={CalendarClock} tone="info" note={`${n(s.appointments.total)} en total`} />
            <Stat label="Cambios en 24 h" value={n(s.activity.changes24h)} icon={Activity} tone="info" note="Registrados en la bitácora" />
          </StatGrid>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>Seguridad de los accesos</CardTitle>
                <p className="text-sm text-ink-3">Si algo no cuadra, revíselo en Usuarios o en la Bitácora.</p>
              </CardHeader>
              <CardBody className="flex flex-1 flex-col gap-4">
                <dl className="flex flex-col divide-y divide-rule">
                  <Row label="Bloqueados ahora" value={s.users.locked} icon={Lock} warn={s.users.locked > 0} />
                  <Row label="Intentos fallidos en 24 h" value={s.activity.failedLogins24h} icon={ShieldAlert} warn={s.activity.failedLogins24h >= 10} />
                  <Row label="Con contraseña temporal" value={s.users.pendingPassword} icon={KeyRound} />
                  <Row label="Usuarios desactivados" value={s.users.inactive} icon={UserX} />
                  <Row label="Roles definidos" value={s.roles} icon={ShieldCheck} />
                </dl>
                <div className="mt-auto flex flex-wrap gap-2">
                  {canUsers && (
                    <Button variant="secondary" size="sm" asChild>
                      <Link href="/usuarios">
                        <Users /> Ir a Usuarios
                      </Link>
                    </Button>
                  )}
                  {canAudit && (
                    <Button variant="secondary" size="sm" asChild>
                      <Link href="/auditoria">
                        <ShieldCheck /> Ir a la Bitácora
                      </Link>
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle>Servidor y base de datos</CardTitle>
                <p className="text-sm text-ink-3">Datos para soporte técnico.</p>
              </CardHeader>
              <CardBody className="flex flex-1 flex-col gap-4">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 [&>*]:border-b [&>*]:border-rule [&>*]:py-2.5 [&>*:nth-last-child(-n+2)]:border-0">
                  <dt className="text-ink-2">Versión de ClinAgenda</dt>
                  <dd className="tabular font-bold">{s.appVersion}</dd>
                  <dt className="text-ink-2">Encendido desde</dt>
                  <dd className="tabular font-bold">{dateTime(s.startedAt)}</dd>
                  <dt className="text-ink-2">PostgreSQL</dt>
                  <dd className="tabular font-bold">{s.database.version}</dd>
                  <dt className="text-ink-2">Tamaño de la base</dt>
                  <dd className="tabular font-bold">{bytes(s.database.bytes)}</dd>
                  <dt className="text-ink-2">Última actualización</dt>
                  <dd className="truncate font-mono text-sm" title={s.database.lastMigration ?? ''}>
                    {s.database.lastMigration ?? '—'}
                  </dd>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" asChild>
                    <a href="/api/docs" target="_blank" rel="noreferrer">
                      <FileText /> Documentación
                    </a>
                  </Button>
                  <Button variant="secondary" size="sm" asChild>
                    <a href="/api/health" target="_blank" rel="noreferrer">
                      <Database /> Prueba de salud
                    </a>
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Row({ label, value, icon: Icon, warn = false }: { label: string; value: number; icon: typeof Lock; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="flex items-center gap-2 text-ink-2">
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className={warn ? 'tabular rounded-sm bg-redpen-soft px-2 font-bold text-redpen' : 'tabular font-bold'}>{value}</dd>
    </div>
  );
}
