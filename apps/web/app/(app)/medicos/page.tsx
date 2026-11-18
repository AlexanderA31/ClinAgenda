'use client';

import { WEEKDAY_LABELS } from '@clinagenda/schemas';
import { useDoctors } from '@/lib/queries';
import { phone } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DAYS = [1, 2, 3, 4, 5, 6];

/** Semana de cada médico: en qué clínica está cada día. Así se ve de un vistazo que nadie está en dos lugares a la vez. */
export default function DoctorsPage() {
  const doctors = useDoctors();
  return (
    <>
      <PageHeader title="Médicos" description="Horario semanal de cada médico y en qué clínica atiende cada día." />
      {doctors.isPending ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="rounded-lg border border-rule bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Médico</TableHead>
                {DAYS.map((d) => (
                  <TableHead key={d}>{WEEKDAY_LABELS[d]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {doctors.data?.map((doc) => {
                const clinicsCount = new Set(doc.assignments.map((a) => a.clinicId)).size;
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="min-w-56">
                      <p className="font-bold">{doc.fullName}</p>
                      <p className="text-sm text-ink-2">{doc.specialty}</p>
                      {doc.phone && <p className="font-mono text-sm text-ink-3">{phone(doc.phone)}</p>}
                      <div className="mt-1 flex gap-1">
                        {!doc.active && <Badge tone="danger">Inactivo</Badge>}
                        {clinicsCount > 1 && <Badge tone="info">Atiende en {clinicsCount} clínicas</Badge>}
                      </div>
                    </TableCell>
                    {DAYS.map((d) => {
                      const slots = doc.assignments.filter((a) => a.weekday === d);
                      return (
                        <TableCell key={d} className="min-w-32 align-top">
                          <ul className="flex flex-col gap-1">
                            {slots.map((s) => (
                              <li key={s.id} className="rounded-sm bg-surface-2 px-2 py-1 text-sm">
                                <span className="block font-bold">{s.clinicName.replace('Clínica ', '')}</span>
                                <span className="font-mono text-ink-2">
                                  {s.startTime}–{s.endTime}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
