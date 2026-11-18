import type { Metadata } from 'next';
import { PatientAppointment } from './patient-appointment';

export const metadata: Metadata = { title: 'Su cita', robots: { index: false, follow: false } };

export default async function PatientLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="grid min-h-dvh place-items-center py-8" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
      <PatientAppointment token={token} />
    </main>
  );
}
