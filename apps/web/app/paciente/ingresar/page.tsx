import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthSplit } from '@/components/portal/auth-split';
import { PatientLoginForm } from './patient-login-form';

export const metadata: Metadata = { title: 'Ingresar' };
export const dynamic = 'force-dynamic';

export default function PatientLoginPage() {
  return (
    <AuthSplit title="Sus citas, cuando las necesite." lede="Agende, revise o cancele sus citas en las tres clínicas sin llamar.">
      <Suspense>
        <PatientLoginForm />
      </Suspense>
    </AuthSplit>
  );
}
