'use client';

import type { Permission } from '@clinagenda/schemas';
import { useCan } from '@/lib/session';
import { Notice } from '@/components/ui/misc';

/** La API ya bloquea por permiso; esto evita mostrar una pantalla que no se puede usar. */
export function RequirePermission({ permission, children }: { permission: Permission | Permission[]; children: React.ReactNode }) {
  const allowed = useCan(...(Array.isArray(permission) ? permission : [permission]));
  if (!allowed) {
    return (
      <Notice tone="warn" title="Esta sección no está disponible para su usuario">
        Si la necesita, pídale a la dirección que le dé el permiso en su rol.
      </Notice>
    );
  }
  return <>{children}</>;
}
