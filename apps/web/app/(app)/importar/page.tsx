'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, FileSearch, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { ImportKind, ImportReport, ImportRowResult } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Notice, PageHeader } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RequireRole } from '@/components/layout/require-role';

const STATUS: Record<ImportRowResult['status'], { label: string; tone: 'good' | 'info' | 'warn' | 'danger' }> = {
  IMPORTED: { label: 'Entra', tone: 'good' },
  FIXED: { label: 'Entra corregido', tone: 'info' },
  DUPLICATE: { label: 'Ya existía', tone: 'warn' },
  REJECTED: { label: 'Rechazado', tone: 'danger' },
};

const KINDS: { value: ImportKind; label: string; columns: string }[] = [
  { value: 'patients', label: 'Pacientes', columns: 'nombres, apellidos, cedula, fecha_nacimiento, telefono, correo, direccion, representante' },
  { value: 'doctors', label: 'Médicos', columns: 'nombre, especialidad, telefono' },
  { value: 'appointments', label: 'Citas (historial)', columns: 'fecha, hora, cedula o paciente, medico, clinica, estado, motivo' },
];

export default function ImportPage() {
  return (
    <RequireRole roles={['ADMIN']}>
      <Importer />
    </RequireRole>
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
      <PageHeader
        title="Importar datos"
        description="Cargue un archivo CSV (Excel → Guardar como → CSV). Primero se muestra una vista previa: nada se guarda hasta que usted confirme."
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <Field id="imp-kind" label="¿Qué va a importar?">
          <Select value={kind} onChange={(e) => (setKind(e.target.value as ImportKind), setReport(null))}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="imp-file" label="Archivo CSV" hint={`Columnas reconocidas: ${info.columns}`}>
          <Input type="file" accept=".csv,text/csv" className="py-2" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setReport(null))} />
        </Field>
        <Button variant="secondary" size="lg" disabled={!file || run.isPending} onClick={() => run.mutate(true)}>
          <FileSearch /> Revisar archivo
        </Button>
      </div>
      {kind === 'appointments' && <Notice tone="info">Importe primero pacientes y médicos: las citas se enlazan por cédula (o nombre exacto) del paciente y nombre del médico.</Notice>}
      {run.isError && <Notice tone="danger" title="No se pudo leer el archivo">{errorMessage(run.error)}</Notice>}

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
