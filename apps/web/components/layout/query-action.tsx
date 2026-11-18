'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Abre una acción de la pantalla cuando la URL trae `?<name>=1` (por ejemplo, "Nueva clínica" desde el menú)
 * y quita el parámetro: así el mismo enlace vuelve a funcionar y recargar la página no la reabre.
 */
export function QueryAction({ name, onMatch }: { name: string; onMatch: () => void }) {
  return (
    <Suspense fallback={null}>
      <Watch name={name} onMatch={onMatch} />
    </Suspense>
  );
}

function Watch({ name, onMatch }: { name: string; onMatch: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wants = params.has(name);
  useEffect(() => {
    if (!wants) return;
    onMatch();
    const rest = new URLSearchParams(params);
    rest.delete(name);
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
    // Solo cuando aparece el parámetro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wants]);
  return null;
}
