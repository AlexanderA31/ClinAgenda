'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarPlus, Pencil } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS } from '@clinagenda/schemas';
import { errorMessage } from '@/lib/api';
import { phone, shortDate, time } from '@/lib/format';
import { useAppointments, usePatient } from '@/lib/queries';
import { useCan } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { PatientForm } from '@/components/forms/patient-form';
import { StatusBadge } from '@/components/appointments/status-badge';
import { AppointmentPanel } from '@/components/appointments/appointment-panel';
import { BookingWizard } from '@/components/appointments/booking-wizard';

export default function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canEdit = useCan('pacientes.editar');
  const patient = usePatient(id);
  const history = useAppointments({ patientId: id, pageSize: 100, sortBy: 'startsAt', sortDir: 'desc' });
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  if (patient.isPending) return <Skeleton className="h-96" />;
  if (patient.isError) return <Notice tone="danger" title="No se pudo abrir la ficha">{errorMessage(patient.error)}</Notice>;
  const p = patient.data;

  const rows: [string, React.ReactNode][] = [
    ['Código', <span key="c" className="font-mono">{p.code}</span>],
    ['Nacimiento', `${shortDate(p.birthDate + 'T17:00:00Z')} · ${p.age} años${p.birthDateEstimated ? ' (fecha aproximada)' : ''}`],
    ['Documento', p.documentNumber ? `${DOCUMENT_TYPE_LABELS[p.documentType]} ${p.documentNumber}` : `Sin documento — ${p.noDocumentReason ?? ''}`],
    ['Teléfono', <span key="t" className="font-mono">{phone(p.phone)}</span>],
    ['Correo', p.email ?? '—'],
    ['Dirección', p.address ?? '—'],
  ];
  if (p.contactNote) rows.push(['Cómo ubicarlo', p.contactNote]);
  if (p.guardian) rows.push(['Representante', `${p.guardian.fullName} (${p.guardian.relationship}) · ${phone(p.guardian.phone)}`]);

  return (
    <>
      <Link href="/pacientes" className="flex items-center gap-2 font-bold text-ballpoint">
        <ArrowLeft className="size-5" /> Pacientes
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold">{p.fullName}</h1>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil /> Corregir datos
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setBooking(true)}>
              <CalendarPlus /> Darle una cita
            </Button>
          )}
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-3">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Citas</CardTitle>
          </CardHeader>
          <CardBody>
            {history.data?.items.length ? (
              <ul className="flex flex-col divide-y divide-rule">
                {history.data.items.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => setOpenId(a.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left hover:bg-surface-2">
                      <span>
                        <span className="tabular font-mono">{shortDate(a.startsAt)} {time(a.startsAt)}</span>
                        <span className="block text-sm text-ink-2">
                          {a.doctor.fullName} · {a.clinic.name}
                        </span>
                      </span>
                      <StatusBadge status={a.status} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Todavía sin citas" />
            )}
          </CardBody>
        </Card>
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent side title="Corregir datos del paciente" description="Cada cambio queda registrado en la bitácora.">
          {editing && <PatientForm patient={p} onSaved={() => (setEditing(false), void patient.refetch())} />}
        </DialogContent>
      </Dialog>
      <BookingWizard open={booking} onOpenChange={setBooking} preset={{ patient: p }} />
      <AppointmentPanel id={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </>
  );
}
