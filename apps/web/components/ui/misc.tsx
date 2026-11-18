import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

const tones = {
  info: { cls: 'border-ballpoint/30 bg-ballpoint-soft text-ink', Icon: Info, iconCls: 'text-ballpoint' },
  good: { cls: 'border-good/30 bg-good-soft text-ink', Icon: CheckCircle2, iconCls: 'text-good' },
  warn: { cls: 'border-warn/40 bg-warn-soft text-ink', Icon: AlertTriangle, iconCls: 'text-warn' },
  danger: { cls: 'border-redpen/40 bg-redpen-soft text-ink', Icon: XCircle, iconCls: 'text-redpen' },
};

/** Aviso con ícono + texto: el color nunca es la única señal. */
export function Notice({ tone = 'info', title, children, className }: { tone?: keyof typeof tones; title?: string; children?: React.ReactNode; className?: string }) {
  const t = tones[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-md border-2 px-4 py-3', t.cls, className)}>
      <t.Icon className={cn('mt-0.5 size-6 shrink-0', t.iconCls)} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="ruled flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-rule-strong px-6 py-10 text-center">
      <p className="font-hand text-3xl text-ink-2">{title}</p>
      {children && <div className="max-w-md text-ink-3">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        {description && <p className="max-w-prose text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
