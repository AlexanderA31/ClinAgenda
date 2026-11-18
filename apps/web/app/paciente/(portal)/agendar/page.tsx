import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getDirectory } from '@/lib/directory';
import { Notice } from '@/components/ui/misc';
import { BookingFlow } from './booking-flow';

export const metadata: Metadata = { title: 'Agendar una cita' };
export const dynamic = 'force-dynamic';

export default async function PortalBookPage() {
  const directory = await getDirectory();
  return (
    <>
      {directory ? (
        <Suspense>
          <BookingFlow directory={directory} />
        </Suspense>
      ) : (
        <div className="max-w-3xl">
          <Notice tone="warn" title="No podemos mostrar los horarios en este momento">
            Intente en unos minutos o llame a su clínica.
          </Notice>
        </div>
      )}
    </>
  );
}
