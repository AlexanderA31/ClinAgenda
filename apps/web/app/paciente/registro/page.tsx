import type { Metadata } from 'next';
import { AuthSplit } from '@/components/portal/auth-split';
import { PatientRegisterForm } from './patient-register-form';

export const metadata: Metadata = { title: 'Crear cuenta' };
export const dynamic = 'force-dynamic';

export default function PatientRegisterPage() {
  return (
    <AuthSplit title="Agende en línea, sin llamar." lede="Cree su cuenta una sola vez. Después elija clínica, médico y hora.">
      <PatientRegisterForm />
    </AuthSplit>
  );
}
