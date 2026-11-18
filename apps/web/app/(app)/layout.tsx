'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMe, SessionProvider } from '@/lib/session';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/misc';
import { OfflineError } from '@/lib/api';
import { Notice } from '@/components/ui/misc';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (me.data?.mustChangePassword && pathname !== '/cuenta') router.replace('/cuenta?primera=1');
  }, [me.data, pathname, router]);

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
  return (
    <SessionProvider user={me.data}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
