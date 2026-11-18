import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import s from '@/components/landing/landing.module.css';
import { QuitoPanorama } from '@/components/landing/quito-panorama';
import { openState, quitoNow } from '@/components/landing/hours';
import { cn } from '@/lib/utils';
import { getDirectory } from '@/lib/directory';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Ingresar' };
export const dynamic = 'force-dynamic';

/** Saludo según la hora de Quito, no la del servidor. */
function greeting() {
  const h = Math.floor(quitoNow().minutes / 60);
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export default async function LoginPage() {
  const clinics = (await getDirectory())?.clinics ?? [];
  return (
    <div className={cn(s.page, 'grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]')}>
      {/* El mismo Quito de la página pública: el personal entra por la misma puerta que los pacientes */}
      <section className={cn(s.hero, 'flex flex-col justify-between')}>
        <div className={cn(s.gutter, 'flex flex-col gap-6 pb-8 pt-6 lg:pt-10')}>
          <Link href="/" className="w-fit font-display text-2xl font-extrabold">
            Clínicas Paredes
          </Link>
          <div className="hidden flex-col gap-4 lg:flex">
            <h1 className={cn(s.headline, 'max-w-[10ch] !text-[clamp(3rem,6vw,5.5rem)]')}>{greeting()}.</h1>
            <p className={cn(s.lede, 'max-w-[30rem] text-xl')}>Hola, bienvenido a Clínicas Paredes. Así están las clínicas en este momento:</p>
          </div>
        </div>
        {clinics.length > 0 && <QuitoPanorama clinics={clinics} initial={clinics.map((c) => openState(c.schedule, c.closures))} />}
      </section>

      <main className={cn(s.gutter, 'flex items-center justify-center py-10 lg:py-16')}>
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
