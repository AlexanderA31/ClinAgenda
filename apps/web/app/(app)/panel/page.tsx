'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DashboardReport } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { addDays, dayLabel, todayIso } from '@/lib/format';
import { useClinics } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { ChartContainer, ChartTooltipContent, LegendFor, Recharts, type ChartConfig } from '@/components/charts/chart';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Notice, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const { Bar, BarChart, CartesianGrid, LabelList, Tooltip, XAxis, YAxis } = Recharts;

// Orden fijo de la paleta validada (slot 1..4). El color sigue a la serie, nunca a su posición.
const dailyConfig: ChartConfig = {
  attended: { label: 'Atendidas', color: 'var(--series-1)' },
  scheduled: { label: 'Por atender', color: 'var(--series-2)' },
  noShow: { label: 'No asistieron', color: 'var(--series-3)' },
  cancelled: { label: 'Canceladas', color: 'var(--series-4)' },
};
const singleConfig: ChartConfig = { count: { label: 'Citas', color: 'var(--series-1)' } };

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '3 meses' },
];

export default function PanelPage() {
  const user = useSession();
  const clinics = useClinics();
  const [days, setDays] = useState(30);
  const [clinicId, setClinicId] = useState('');
  const to = todayIso();
  const from = addDays(to, -(days - 1));

  const report = useQuery({
    queryKey: ['report', from, to, clinicId],
    queryFn: () => api<DashboardReport>('/reports/dashboard', { query: { from, to, clinicId: clinicId || undefined } }),
    placeholderData: (p) => p,
  });
  const r = report.data;
  const totalBooked = r ? r.totals.attended + r.totals.noShow + r.totals.scheduled : 0;
  const noShowRate = r && r.totals.attended + r.totals.noShow > 0 ? r.totals.noShow / (r.totals.attended + r.totals.noShow) : 0;

  return (
    <>
      <PageHeader
        title="Panel"
        description={user.role === 'MEDICO' ? 'Cifras de su propia agenda.' : 'Cómo van las tres clínicas: citas, inasistencias, cancelaciones y ocupación.'}
      />

      {/* Filtros en una sola fila, arriba de todos los gráficos */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Período" className="flex rounded-md bg-surface-2 p-1">
          {RANGES.map((x) => (
            <button
              key={x.days}
              role="radio"
              aria-checked={days === x.days}
              onClick={() => setDays(x.days)}
              className={cn('min-h-10 rounded-sm px-4 font-bold', days === x.days ? 'bg-surface text-ballpoint shadow-sm' : 'text-ink-2')}
            >
              {x.label}
            </button>
          ))}
        </div>
        <Select aria-label="Clínica" className="w-auto" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
          <option value="">Las tres clínicas</option>
          {clinics.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <p className="text-ink-3">
          Del {dayLabel(from)} al {dayLabel(to)}
        </p>
      </div>

      {report.isError && <Notice tone="danger" title="No se pudo cargar el panel">{errorMessage(report.error)}</Notice>}
      {!r ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Citas dadas" value={totalBooked} note={`${r.totals.scheduled} por atender`} />
            <Kpi label="Atendidas" value={r.totals.attended} />
            <Kpi label="No asistieron" value={r.totals.noShow} note={`${Math.round(noShowRate * 100)} % de las que ya pasaron`} />
            <Kpi label="Canceladas" value={r.totals.cancelled} note={`${r.totals.patientsNew} pacientes nuevos`} />
          </dl>

          <Card>
            <CardHeader>
              <CardTitle>Citas por día</CardTitle>
              <LegendFor config={dailyConfig} />
            </CardHeader>
            <CardBody>
              <ChartContainer config={dailyConfig} className="h-72" role="img" aria-label="Gráfico de barras apiladas de citas por día según su estado">
                <BarChart data={r.daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={days > 40 ? 1 : 4}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)} minTickGap={24} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<ChartTooltipContent labelFormatter={(d) => dayLabel(String(d))} />} />
                  {(['attended', 'scheduled', 'noShow', 'cancelled'] as const).map((k, i, arr) => (
                    <Bar key={k} isAnimationActive={false} dataKey={k} stackId="a" fill={`var(--color-${k})`} stroke="var(--surface)" strokeWidth={days > 40 ? 0 : 2} radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0} />
                  ))}
                </BarChart>
              </ChartContainer>
              <details className="mt-3">
                <summary className="cursor-pointer text-ink-2">Ver los datos como tabla</summary>
                <Table className="mt-2 text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Día</TableHead>
                      {Object.values(dailyConfig).map((c) => (
                        <TableHead key={c.label} className="text-right">
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.daily.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell className="first-letter:uppercase">{dayLabel(d.date)}</TableCell>
                        <TableCell className="tabular text-right">{d.attended}</TableCell>
                        <TableCell className="tabular text-right">{d.scheduled}</TableCell>
                        <TableCell className="tabular text-right">{d.noShow}</TableCell>
                        <TableCell className="tabular text-right">{d.cancelled}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Ocupación por clínica</CardTitle>
                <p className="text-sm text-ink-3">Citas dadas sobre los turnos que permiten los horarios de los médicos.</p>
              </CardHeader>
              <CardBody className="flex flex-col gap-4">
                {r.byClinic.map((c) => (
                  <div key={c.clinicId} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold">{c.clinicName}</span>
                      <span className="tabular text-ink-2">
                        <strong className="text-ink">{Math.round(c.occupancy * 100)} %</strong> · {c.appointments} de {c.capacity} turnos
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-sm bg-surface-2" role="img" aria-label={`${c.clinicName}: ${Math.round(c.occupancy * 100)} por ciento de ocupación`}>
                      <div className="h-full rounded-sm" style={{ width: `${Math.max(1, c.occupancy * 100)}%`, background: 'var(--series-1)' }} />
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Horas con más citas</CardTitle>
                <p className="text-sm text-ink-3">Sirve para decidir cuántas recepcionistas poner en cada turno.</p>
              </CardHeader>
              <CardBody>
                <ChartContainer config={singleConfig} className="h-56" role="img" aria-label="Citas por hora del día">
                  <BarChart data={r.byHour.map((h) => ({ hour: `${h.hour}:00`, count: h.count }))} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={1} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" isAnimationActive={false} fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Motivos de cancelación</CardTitle>
              </CardHeader>
              <CardBody>
                {r.cancelReasons.length ? (
                  <ChartContainer config={singleConfig} className="h-auto" style={{ height: 24 + r.cancelReasons.length * 44 }} role="img" aria-label="Cancelaciones por motivo">
                    <BarChart data={r.cancelReasons} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis type="category" dataKey="reason" width={190} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" isAnimationActive={false} fill="var(--color-count)" radius={[0, 4, 4, 0]} barSize={22}>
                        <LabelList dataKey="count" position="right" className="fill-[var(--ink-2)] text-sm" />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-ink-3">Sin cancelaciones en este período.</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Por médico</CardTitle>
              </CardHeader>
              <CardBody className="px-0 py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Médico</TableHead>
                      <TableHead className="text-right">Citas</TableHead>
                      <TableHead className="text-right">No asistieron</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.byDoctor.map((d) => (
                      <TableRow key={d.doctorId}>
                        <TableCell className="font-bold">{d.doctorName}</TableCell>
                        <TableCell className="tabular text-right">{d.appointments}</TableCell>
                        <TableCell className="tabular text-right">
                          {d.noShow} <span className="text-ink-3">({d.appointments ? Math.round((d.noShow / d.appointments) * 100) : 0} %)</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-rule bg-surface px-4 py-3">
      <dt className="text-sm font-bold uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="tabular font-display text-4xl font-extrabold">{value}</dd>
      {note && <dd className="text-sm text-ink-2">{note}</dd>}
    </div>
  );
}
