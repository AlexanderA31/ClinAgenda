'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileCheck2, FileSearch, FileSpreadsheet, Stethoscope, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { ImportKind, ImportReport, ImportRowResult } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Notice, PageHeader } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RequirePermission } from '@/components/layout/require-role';

const STATUS: Record<ImportRowResult['status'], { label: string; tone: 'good' | 'info' | 'warn' | 'danger' }> = {
  IMPORTED: { label: 'Entra', tone: 'good' },
  FIXED: { label: 'Entra corregido', tone: 'info' },
  DUPLICATE: { label: 'Ya existía', tone: 'warn' },
  REJECTED: { label: 'Rechazado', tone: 'danger' },
};

// En el orden en que conviene importar: primero médicos, luego pacientes y al final las citas.
const KINDS: { value: ImportKind; label: string; icon: typeof Users; columns: string }[] = [
  { value: 'doctors', label: 'Médicos', icon: Stethoscope, columns: 'nombre, especialidad, telefono' },
  { value: 'patients', label: 'Pacientes', icon: Users, columns: 'nombres, apellidos, cedula, fecha_nacimiento, telefono, correo, direccion, representante' },
  { value: 'appointments', label: 'Citas (historial)', icon: CalendarClock, columns: 'fecha, hora, cedula o paciente, medico, clinica, estado, motivo' },
];

export default function ImportPage() {
  return (
    <RequirePermission permission="datos.importar">
      <Importer />
    </RequirePermission>
  );
}

function Importer() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<ImportKind>('patients');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [filter, setFilter] = useState<'all' | ImportRowResult['status']>('all');

  const run = useMutation({
    mutationFn: (dryRun: boolean) => {
      const fd = new FormData();
      fd.append('file', file!);
      return api<ImportReport>(`/imports/${kind}`, { method: 'POST', body: fd, query: { dryRun } });
    },
    onSuccess: (r) => {
      setReport(r);
      if (!r.dryRun) {
        toast.success(`Importación terminada: ${r.imported + r.fixed} registros cargados.`);
        void qc.invalidateQueries();
      }
    },
  });

  const rows = report?.rows.filter((r) => filter === 'all' || r.status === filter) ?? [];
  const info = KINDS.find((k) => k.value === kind)!;

  return (
    <>
      <PageHeader title="Importar datos" description="Cargue un archivo CSV (Excel → Guardar como → CSV). Primero se muestra una vista previa: nada se guarda hasta que usted confirme." />
      {/* Dos pasos del mismo tamaño: qué importar y qué archivo */}
      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-4">
          <legend className="sr-only">¿Qué va a importar?</legend>
          <p className="font-bold">1. ¿Qué va a importar?</p>
          <div role="radiogroup" aria-label="Tipo de datos" className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => (setKind(k.value), setReport(null))}
                className={cn(
                  'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-md border-2 px-2 text-center font-bold',
                  kind === k.value ? 'border-ballpoint bg-ballpoint-soft text-ballpoint' : 'border-rule-strong text-ink-2 hover:border-ballpoint hover:text-ink',
                )}
              >
                <k.icon className="size-6" aria-hidden />
                <span className="leading-tight">{k.label}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-3">
            Columnas que reconoce: <span className="font-mono">{info.columns}</span>
          </p>
        </fieldset>

        <div className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-4">
          <p className="font-bold">2. Archivo CSV</p>
          <label
            htmlFor="imp-file"
            className="flex min-h-20 cursor-pointer items-center gap-3 rounded-md border-2 border-dashed border-rule-strong px-4 hover:border-ballpoint hover:bg-ballpoint-soft"
          >
            <FileSpreadsheet className="size-7 shrink-0 text-ink-3" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-bold">{file ? file.name : 'Elegir archivo…'}</span>
              <span className="text-sm text-ink-3">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : 'Excel → Guardar como → CSV'}</span>
            </span>
            <input id="imp-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setReport(null))} />
          </label>
          <Button size="lg" disabled={!file || run.isPending} onClick={() => run.mutate(true)}>
            <FileSearch /> Revisar archivo
          </Button>
        </div>
      </div>
      {kind === 'appointments' && <Notice tone="info">Importe primero pacientes y médicos: las citas se enlazan por cédula (o nombre exacto) del paciente y nombre del médico.</Notice>}
      {run.isError && (
        <Notice tone="danger" title="No se pudo leer el archivo">
          {errorMessage(run.error)}
        </Notice>
      )}

      {report && (
        <section className="flex flex-col gap-4">
          <Notice tone={report.dryRun ? 'info' : 'good'} title={report.dryRun ? `Vista previa de ${report.fileName}` : `Importado: ${report.fileName}`}>
            {report.total} filas: {report.imported} entran tal cual, {report.fixed} con una corrección automática, {report.duplicates} ya existían y {report.rejected} rechazadas.
            {report.dryRun && ' Las rechazadas no se cargan: corríjalas en el archivo o regístrelas a mano.'}
          </Notice>
          {report.dryRun && report.imported + report.fixed > 0 && (
            <Button size="lg" className="self-start" onClick={() => run.mutate(false)} disabled={run.isPending}>
              <Upload /> Confirmar e importar {report.imported + report.fixed} registros
            </Button>
          )}
          {!report.dryRun && (
            <p className="flex items-center gap-2 text-good">
              <FileCheck2 className="size-5" /> Listo. Quedó registrado en la bitácora.
            </p>
          )}
          <div role="radiogroup" aria-label="Filtrar filas" className="flex flex-wrap gap-2">
            {(['all', 'REJECTED', 'FIXED', 'DUPLICATE', 'IMPORTED'] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? 'primary' : 'secondary'} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Todas' : STATUS[f].label}
              </Button>
            ))}
          </div>
          <div className="rounded-lg border border-rule bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Dato</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 300).map((r) => (
                  <TableRow key={r.row}>
                    <TableCell className="tabular font-mono">{r.row}</TableCell>
                    <TableCell>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-ink-2">{r.data ? Object.values(r.data).filter(Boolean).slice(0, 3).join(' · ') : '—'}</TableCell>
                    <TableCell>
                      <ul className="text-sm">
                        {r.messages.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </>
  );
}
