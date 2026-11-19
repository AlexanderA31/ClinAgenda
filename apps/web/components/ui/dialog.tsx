'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Lo que vive fuera del diálogo pero debe seguir funcionando con él abierto: los avisos (con su "Deshacer")
 * y el botón de accesibilidad. Tocarlos no cierra el diálogo (y globals.css les devuelve los clics).
 */
const OUTSIDE_ALLOWED = '[data-sonner-toaster], #a11y-toggle, #a11y-panel, #a11y-reader';

/**
 * Radix avisa del clic "afuera" después del click, cuando el elemento tocado puede haber cambiado
 * (el botón de accesibilidad cambia su ícono al abrirse). Si ya no está en la página, se mira qué hay
 * en el punto del clic.
 */
function touchesAllowed(e: Event): boolean {
  const target = e.target as Element | null;
  if (target?.isConnected) return !!target.closest(OUTSIDE_ALLOWED);
  const original = (e as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent;
  if (original instanceof MouseEvent) return !!document.elementFromPoint(original.clientX, original.clientY)?.closest(OUTSIDE_ALLOWED);
  return false;
}

export function DialogContent({
  className,
  children,
  title,
  description,
  side,
  closable = true,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string; side?: boolean; closable?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#0a1218]/50" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex max-h-[100dvh] flex-col overflow-hidden bg-surface text-ink shadow-xl',
          side
            ? 'inset-y-0 right-0 w-full max-w-xl border-l border-rule'
            : 'left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-rule',
          className,
        )}
        onInteractOutside={(e) => {
          if (touchesAllowed(e)) e.preventDefault();
          onInteractOutside?.(e);
        }}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="font-display text-xl font-bold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-ink-2">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          {closable && (
            <DialogPrimitive.Close className="-mr-2 -mt-1 rounded-md p-2 text-ink-2 hover:bg-surface-2" aria-label="Cerrar">
              <X className="size-6" />
            </DialogPrimitive.Close>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
