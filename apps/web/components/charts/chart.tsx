'use client';

import * as React from 'react';
import * as Recharts from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Contenedor de gráficos al estilo shadcn/ui charts: cada serie declara su etiqueta y su color
 * (un token de tema), y se expone como --color-<serie> para que Recharts lo use en claro y oscuro.
 * Colores en orden fijo de la paleta validada; el texto siempre usa tokens de tinta, nunca el color de la serie.
 */
export type ChartConfig = Record<string, { label: string; color: string }>;

const ChartContext = React.createContext<ChartConfig | null>(null);
export const useChartConfig = () => React.useContext(ChartContext) ?? {};

export function ChartContainer({ config, className, children, style: extraStyle, ...props }: React.HTMLAttributes<HTMLDivElement> & { config: ChartConfig; children: React.ReactElement }) {
  // Las variables de color se combinan con el style que llegue (p. ej. una altura), nunca se reemplazan.
  const style = { ...extraStyle, ...Object.fromEntries(Object.entries(config).map(([k, v]) => [`--color-${k}`, v.color])) } as React.CSSProperties;
  return (
    <ChartContext.Provider value={config}>
      <div
        className={cn(
          'h-64 w-full text-sm [&_.recharts-cartesian-axis-tick_text]:fill-[var(--ink-3)] [&_.recharts-cartesian-grid_line]:stroke-[var(--chart-grid)] [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-[var(--surface-2)] [&_.recharts-curve.recharts-tooltip-cursor]:stroke-[var(--rule-strong)]',
          className,
        )}
        style={style}
        {...props}
      >
        <Recharts.ResponsiveContainer>{children}</Recharts.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: { dataKey?: string | number; name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  labelFormatter?: (label: string | number) => React.ReactNode;
  valueSuffix?: string;
};

export function ChartTooltipContent({ active, payload, label, labelFormatter, valueSuffix = '' }: TooltipProps) {
  const config = useChartConfig();
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-md border border-rule bg-surface px-3 py-2 text-sm shadow-lg">
      {label !== undefined && <p className="mb-1 font-bold text-ink">{labelFormatter ? labelFormatter(label) : label}</p>}
      <ul className="flex flex-col gap-1">
        {payload.map((p) => {
          const key = String(p.dataKey ?? p.name);
          return (
            <li key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-ink-2">
                <span className="size-2.5 rounded-sm" style={{ background: `var(--color-${key}, ${p.color})` }} aria-hidden />
                {config[key]?.label ?? p.name}
              </span>
              <span className="tabular font-bold text-ink">
                {p.value}
                {valueSuffix}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Leyenda siempre visible para 2+ series: la identidad nunca depende solo del color. */
export function ChartLegend({ keys }: { keys?: string[] }) {
  const config = useChartConfig();
  const entries = Object.entries(config).filter(([k]) => !keys || keys.includes(k));
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
      {entries.map(([k, v]) => (
        <li key={k} className="flex items-center gap-2">
          <span className="size-3 rounded-sm" style={{ background: v.color }} aria-hidden />
          {v.label}
        </li>
      ))}
    </ul>
  );
}

export function LegendFor({ config, keys }: { config: ChartConfig; keys?: string[] }) {
  return (
    <ChartContext.Provider value={config}>
      <ChartLegend keys={keys} />
    </ChartContext.Provider>
  );
}

export { Recharts };
