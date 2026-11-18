'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  side,
  closable = true,
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
