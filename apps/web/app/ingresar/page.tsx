import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-session';
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

/** Un solo ingreso para pacientes y personal, con el enlace para crear cuenta. Si ya ingresó, va directo a su pantalla. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getServerSession();
  if (session) {
    const { next } = await searchParams;
    // Solo se respeta "next" si es una pantalla de su tipo de cuenta (evita ir y volver entre el ingreso y una página ajena).
    const fits = next?.startsWith('/') && (session.kind === 'patient' ? next.startsWith('/paciente') : !next.startsWith('/paciente'));
    redirect(fits ? next! : session.home);
  }
  return (
    <AuthSplit title={`${greeting()}.`} lede="Hola, bienvenido a Clínicas Paredes. Así están las clínicas en este momento:">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthSplit>
  );
}
