'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus, Wand2 } from 'lucide-react';
import { WEEKDAY_LABELS, type DoctorView } from '@clinagenda/schemas';
import { api } from '@/lib/api';
import { useClinics, useDoctors } from '@/lib/queries';
import { dateTime, phone } from '@/lib/format';
import { useCan } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { DoctorForm } from '@/components/forms/doctor-form';
import { AutoSchedule } from '@/components/doctors/auto-schedule';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DAYS = [1, 2, 3, 4, 5, 6];

/** Semana de cada médico: en qué clínica está cada día. Así se ve de un vistazo que nadie está en dos lugares a la vez. */
export default function DoctorsPage() {
  const doctors = useDoctors();
  const isAdmin = useCan('medicos.gestionar');
  const [editing, setEditing] = useState<DoctorView | 'new' | null>(null);
  const [orphansOf, setOrphansOf] = useState<DoctorView | null>(null);
  const [auto, setAuto] = useState(false);
  const clinics = useClinics();
  return (
    <>
      <PageHeader
        title="Médicos"
        description="Horario semanal de cada médico y en qué clínica atiende cada día."
        actions={
          isAdmin && (
            <>
              <Button variant="secondary" size="lg" disabled={!doctors.data || !clinics.data} onClick={() => setAuto(true)}>
                <Wand2 /> Autodistribuir horario
              </Button>
              <Button size="lg" onClick={() => setEditing('new')}>
                <Plus /> Registrar médico
              </Button>
            </>
          )
        }
      />
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
                      <div className="mt-1 flex flex-wrap gap-1">
                        {!doc.active && <Badge tone="danger">Inactivo</Badge>}
                        {clinicsCount > 1 && <Badge tone="info">Atiende en {clinicsCount} clínicas</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {isAdmin && (
                          <Button variant="ghost" size="sm" onClick={() => setEditing(doc)}>
                            <Pencil /> Editar horario
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setOrphansOf(doc)}>
                          <CalendarClock /> Citas por reprogramar
                        </Button>
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
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent side title={editing === 'new' ? 'Registrar médico' : `Editar a ${editing?.fullName ?? ''}`}>
          {editing && <DoctorForm doctor={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={auto} onOpenChange={setAuto}>
        <DialogContent
          className="max-w-5xl"
          title="Autodistribuir horario"
          description="Propone en qué clínica atiende cada médico cada día, repartiendo parejo. Revise la propuesta: no se guarda hasta que la aplique."
        >
          {auto && doctors.data && clinics.data && <AutoSchedule doctors={doctors.data} clinics={clinics.data} onDone={() => setAuto(false)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!orphansOf} onOpenChange={(o) => !o && setOrphansOf(null)}>
        <DialogContent side title="Citas por reprogramar" description="Citas futuras que ya no encajan en el horario del médico. No se cancelaron: llame al paciente.">
          {orphansOf && <Orphans doctorId={orphansOf.id} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Orphans({ doctorId }: { doctorId: string }) {
  const list = useQuery({
    queryKey: ['doctors', 'orphans', doctorId],
    queryFn: () => api<{ id: string; code: string; startsAt: string; patientName: string; patientPhone: string | null; clinicName: string }[]>(`/doctors/${doctorId}/orphans`),
  });
  if (list.isPending) return <Skeleton className="h-32" />;
  if (!list.data?.length) return <EmptyState title="Nada pendiente">Todas las citas futuras encajan en su horario.</EmptyState>;
  return (
    <ul className="flex flex-col gap-2">
      {list.data.map((o) => (
        <li key={o.id} className="rounded-md border border-rule px-3 py-2">
          <span className="font-mono">{dateTime(o.startsAt)}</span> · <strong>{o.patientName}</strong> · {o.clinicName}
          <span className="block font-mono text-sm text-ink-2">{phone(o.patientPhone)}</span>
        </li>
      ))}
    </ul>
  );
}
