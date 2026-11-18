'use client';

import { use, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { dayLabel, time } from '@/lib/format';
import { useAppointment } from '@/lib/queries';
import { patientUrl } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { Notice, Skeleton } from '@/components/ui/misc';

/**
 * Comprobante impreso para el paciente que no tiene WhatsApp o correo (muchos adultos mayores):
 * fecha, hora, médico, dirección y un código QR / enlace para cancelar sin llamar.
 * Sin cédula ni datos médicos, por si se pierde el papel.
 */
export default function Comprobante({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const appt = useAppointment(id);
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (appt.data) void QRCode.toString(patientUrl(appt.data), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setQr);
  }, [appt.data]);

  if (appt.isPending) return <Skeleton className="m-8 h-96" />;
  if (appt.isError) return <div className="p-8"><Notice tone="danger">{errorMessage(appt.error)}</Notice></div>;
  const a = appt.data;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 bg-white p-8 text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer /> Imprimir
        </Button>
      </div>
      <header className="border-b-2 border-black pb-3">
        <p className="text-sm font-bold uppercase tracking-widest">{a.clinic.name}</p>
        <h1 className="text-3xl font-extrabold">Su cita médica</h1>
      </header>
      <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-lg">
        <dt className="font-bold">Paciente</dt>
        <dd>{a.patient.fullName}</dd>
        <dt className="font-bold">Día</dt>
        <dd className="first-letter:uppercase">{dayLabel(a.startsAt.slice(0, 10))}</dd>
        <dt className="font-bold">Hora</dt>
        <dd className="font-mono text-2xl font-bold">{time(a.startsAt)}</dd>
        <dt className="font-bold">Médico</dt>
        <dd>{a.doctor.fullName} ({a.doctor.specialty})</dd>
        <dt className="font-bold">Código</dt>
        <dd className="font-mono">{a.code}</dd>
      </dl>
      <p className="text-lg">Por favor llegue 10 minutos antes y traiga su documento.</p>
      <section className="flex items-center gap-5 border-2 border-dashed border-black p-4">
        <div className="size-32 shrink-0 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} aria-label="Código QR para ver o cancelar la cita" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-bold">¿No puede venir?</p>
          <p>Escanee el código con la cámara del celular para cancelar, o llame a la clínica. Así el espacio queda para otro paciente.</p>
          <p className="break-all font-mono text-xs">{patientUrl(a)}</p>
        </div>
      </section>
    </main>
  );
}
