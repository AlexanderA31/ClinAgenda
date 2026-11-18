import { Suspense } from 'react';
import type { Metadata } from 'next';
import { quitoNow } from '@/components/landing/hours';
import { AuthSplit } from '@/components/portal/auth-split';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Ingresar' };
export const dynamic = 'force-dynamic';

/** Saludo según la hora de Quito, no la del servidor. */
function greeting() {
  const h = Math.floor(quitoNow().minutes / 60);
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/** Un solo ingreso para pacientes y personal, con el enlace para crear cuenta. */
export default function LoginPage() {
  return (
    <AuthSplit title={`${greeting()}.`} lede="Hola, bienvenido a Clínicas Paredes. Así están las clínicas en este momento:">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthSplit>
  );
}
