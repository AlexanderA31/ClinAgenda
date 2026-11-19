'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Paperclip, Pill, Printer, ShieldCheck, Stethoscope } from 'lucide-react';
import type { PortalMedicalRecord } from '@clinagenda/schemas';
import { api, errorMessage } from '@/lib/api';
import { longDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Notice, PageHeader, Skeleton } from '@/components/ui/misc';
import { DiagnosisLine, FileLink, PrescriptionList } from '@/components/patients/medical-record';

const num = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1, useGrouping: false });

/**
 * Mi ficha: lo que el paciente necesita llevar consigo (alergias, enfermedades, medicación), y de cada
 * consulta el diagnóstico, las indicaciones y la receta para imprimir. Las notas de examen del médico
 * no se muestran aquí; la copia completa se pide en la clínica.
 */
export default function PatientRecordPage() {
  const record = useQuery({ queryKey: ['portal', 'medical-record'], queryFn: () => api<PortalMedicalRecord>('/portal/medical-record') });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mi ficha" description="Sus alergias, diagnósticos, indicaciones y recetas. Si algo no está bien, dígaselo a su médico en la próxima consulta." />
      {record.isPending ? <Skeleton className="h-96" /> : record.isError ? <Notice tone="danger">{errorMessage(record.error)}</Notice> : <Content r={record.data} />}
    </div>
  );
}

function Content({ r }: { r: PortalMedicalRecord }) {
  const h = r.history;
  const rows = [
    ['Grupo sanguíneo', h.bloodType],
    ['Enfermedades', h.chronicConditions],
    ['Medicación habitual', h.medications],
  ] as const;
  return (
    <>
      {h.allergies && !/^ningun[ao]?\b/i.test(h.allergies) ? (
        <div className="flex gap-3 rounded-md border-2 border-redpen bg-redpen-soft px-4 py-3 text-redpen">
          <AlertTriangle className="mt-0.5 size-6 shrink-0" aria-hidden />
          <div>
            <p className="font-extrabold">Usted es alérgico a</p>
            <p className="whitespace-pre-line font-bold text-ink">{h.allergies}</p>
            <p className="mt-1 text-sm text-ink-2">Dígalo siempre antes de recibir un medicamento, también fuera de nuestras clínicas.</p>
          </div>
        </div>
      ) : h.allergies ? (
        <p className="flex items-center gap-2 font-bold text-good">
          <ShieldCheck className="size-5" aria-hidden /> Sin alergias conocidas
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Mi salud</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="flex flex-col gap-4">
                {rows.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm font-bold text-ink-3">{label}</dt>
                    <dd className={value ? 'whitespace-pre-line' : 'text-ink-3'}>{value ?? 'Sin registrar'}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="size-5" aria-hidden /> Resultados y archivos
              </CardTitle>
            </CardHeader>
            <CardBody>
              {r.attachments.length ? (
                <ul className="flex flex-col gap-2">
                  {r.attachments.map((a) => (
                    <li key={a.id}>
                      <FileLink href={`/api/portal/attachments/${a.id}`} file={a} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3">Cuando su médico comparta un resultado, aparecerá aquí.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <section aria-labelledby="mis-consultas" className="flex min-w-0 flex-col gap-4">
          <h2 id="mis-consultas" className="text-xl font-extrabold">
            Mis consultas <span className="font-normal text-ink-3">({r.consultations.length})</span>
          </h2>
          {r.consultations.length ? (
            <ol className="flex flex-col gap-4">
              {r.consultations.map((c) => {
                const when = c.appointment?.startsAt ?? c.createdAt;
                const vitals = [
                  c.systolic != null && c.diastolic != null && ['Presión', `${c.systolic}/${c.diastolic} mmHg`],
                  c.weightKg != null && ['Peso', `${num.format(c.weightKg)} kg`],
                  c.bmi != null && ['IMC', num.format(c.bmi)],
                  c.temperatureC != null && ['Temperatura', `${num.format(c.temperatureC)} °C`],
                ].filter(Boolean) as [string, string][];
                return (
                  <li key={c.id}>
                    <article className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5">
                      <header>
                        <p className="text-sm font-bold text-ink-2 first-letter:uppercase">
                          {longDate(when)}
                          {c.appointment && <span className="font-normal text-ink-3"> · {c.appointment.clinic}</span>}
                        </p>
                        <h3 className="mt-1 text-lg font-extrabold">{c.reason}</h3>
                        <p className="flex items-center gap-1.5 text-sm text-ink-2">
                          <Stethoscope className="size-4" aria-hidden /> {c.doctor.fullName} · {c.doctor.specialty}
                        </p>
                      </header>
                      {vitals.length > 0 && <p className="text-sm text-ink-2">{vitals.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
                      {(c.diagnosis || c.diagnosisCode) && (
                        <section>
                          <h4 className="text-sm font-bold text-ink-3">Diagnóstico</h4>
                          <DiagnosisLine diagnosis={c.diagnosis} code={c.diagnosisCode} codeLabel={c.diagnosisCodeLabel} />
                        </section>
                      )}
                      {c.plan && (
                        <section>
                          <h4 className="text-sm font-bold text-ink-3">Indicaciones</h4>
                          <p className="whitespace-pre-line">{c.plan}</p>
                        </section>
                      )}
                      {c.prescription.length > 0 && (
                        <section className="flex flex-col gap-3 rounded-md border border-rule p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="flex items-center gap-2 font-bold">
                              <Pill className="size-5 text-ballpoint" aria-hidden /> Receta
                            </h4>
                            <Button asChild variant="secondary" size="sm">
                              <a href={`/api/portal/consultations/${c.id}/receta.pdf`} target="_blank" rel="noreferrer">
                                <Printer /> Ver o imprimir
                              </a>
                            </Button>
                          </div>
                          <PrescriptionList items={c.prescription} />
                        </section>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState title="Todavía no hay consultas en su ficha">Después de cada atención, su médico anota aquí el diagnóstico, las indicaciones y la receta.</EmptyState>
          )}
        </section>
      </div>
    </>
  );
}
