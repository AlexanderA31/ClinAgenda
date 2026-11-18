'use client';

import { useMe, SessionProvider } from '@/lib/session';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/misc';
import { OfflineError } from '@/lib/api';
import { Notice } from '@/components/ui/misc';
import { ForcePasswordChange } from '@/components/layout/force-password-change';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (me.isError || !me.data) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Notice tone="warn" title={me.error instanceof OfflineError ? 'Sin conexión con el sistema' : 'No se pudo abrir su sesión'}>
          {me.error instanceof OfflineError ? 'Revise el internet. En cuanto vuelva, recargue esta página.' : <a className="underline" href="/ingresar">Ingresar de nuevo</a>}
        </Notice>
      </div>
    );
  }
  // Con contraseña temporal, el sistema no se muestra: solo el aviso para cambiarla.
  if (me.data.mustChangePassword) {
    return (
      <div className="ruled min-h-dvh">
        <ForcePasswordChange fullName={me.data.fullName} />
      </div>
    );
  }
  return (
    <SessionProvider user={me.data}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
