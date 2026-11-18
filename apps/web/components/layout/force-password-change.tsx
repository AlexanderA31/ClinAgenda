'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChangePasswordForm } from '@/components/forms/change-password-form';

/**
 * Primer ingreso (o contraseña restablecida por la dirección): antes de usar el sistema hay que
 * elegir una contraseña propia. El aviso no se puede cerrar con Esc ni tocando afuera; solo
 * guardando la nueva contraseña o saliendo.
 */
export function ForcePasswordChange({ fullName }: { fullName: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    router.replace('/ingresar');
  };
  return (
    <Dialog open>
      <DialogContent
        closable={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        title="Antes de empezar, cambie su contraseña"
        description={`${fullName}: la contraseña que le dieron es temporal. Elija una que solo usted sepa.`}
      >
        <div className="flex flex-col gap-4">
          <ChangePasswordForm />
          <Button variant="ghost" onClick={() => void logout()}>
            <LogOut /> Salir sin cambiarla
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
