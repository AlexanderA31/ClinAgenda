import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Etiqueta + campo + ayuda + error. El error aparece debajo del campo, en palabras simples,
 * y lo escrito se conserva para corregirlo sin volver a empezar.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  addon,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
  /** Botón pegado al campo (p. ej. mostrar contraseña). */
  addon?: React.ReactNode;
  className?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-bold text-ink">
        {label} {optional && <span className="font-normal text-ink-3">(opcional)</span>}
      </label>
      {addon ? (
        <div className="relative">
          {React.cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
          {addon}
        </div>
      ) : (
        React.cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm font-bold text-redpen">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
