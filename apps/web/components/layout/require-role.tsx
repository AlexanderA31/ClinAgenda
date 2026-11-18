'use client';

import type { Role } from '@clinagenda/schemas';
import { useSession } from '@/lib/session';
import { Notice } from '@/components/ui/misc';

/** La API ya bloquea por rol; esto evita mostrar una pantalla que no se puede usar. */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const user = useSession();
  if (!roles.includes(user.role)) {
    return <Notice tone="warn" title="Esta sección no está disponible para su usuario">Si la necesita, pídale acceso a la dirección.</Notice>;
  }
  return <>{children}</>;
}
