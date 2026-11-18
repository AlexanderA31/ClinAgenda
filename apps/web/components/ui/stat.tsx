import { cn } from '@/lib/utils';

/**
 * Cifra con su etiqueta. Todas las tarjetas de una fila miden lo mismo: la línea de nota se
 * reserva aunque esté vacía, y el grid usa filas de igual alto.
 */
export function Stat({
  label,
  value,
  note,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'info';
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-2 rounded-lg border border-rule bg-surface p-4">
      <dt className="flex items-center justify-between gap-2 font-bold text-ink-2">
        <span className="min-w-0">{label}</span>
        {Icon && (
          <span
            className={cn(
              'hidden size-9 shrink-0 place-items-center rounded-md sm:grid',
              tone === 'good' && 'bg-good-soft text-good',
              tone === 'warn' && 'bg-warn-soft text-warn',
              tone === 'danger' && 'bg-redpen-soft text-redpen',
              tone === 'info' && 'bg-ballpoint-soft text-ballpoint',
              tone === 'neutral' && 'bg-surface-2 text-ink-2',
            )}
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
        )}
      </dt>
      <dd className="tabular font-display text-4xl font-extrabold leading-none">{value}</dd>
      <dd className="mt-auto min-h-5 text-sm text-ink-3">{note ?? ' '}</dd>
    </div>
  );
}

/** Fila de cifras: columnas y filas iguales. */
export function StatGrid({ className, ...props }: React.HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn('grid auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-4', className)} {...props} />;
}
