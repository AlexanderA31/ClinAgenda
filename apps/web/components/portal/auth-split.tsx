import Link from 'next/link';
import s from '@/components/landing/landing.module.css';
import { QuitoPanorama } from '@/components/landing/quito-panorama';
import { openState } from '@/components/landing/hours';
import { getDirectory } from '@/lib/directory';
import { cn } from '@/lib/utils';

/** Pantallas de ingreso y registro del paciente: Quito a la izquierda, el formulario a la derecha. */
export async function AuthSplit({ title, lede, children }: { title: string; lede: string; children: React.ReactNode }) {
  const clinics = (await getDirectory())?.clinics ?? [];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className={cn(s.hero, 'flex flex-col justify-between')}>
        <div className={cn(s.gutter, 'flex flex-col gap-6 pb-8 pt-6 lg:pt-10')}>
          <Link href="/" className="w-fit font-display text-2xl font-extrabold">
            Clínicas Paredes
          </Link>
          <div className="hidden flex-col gap-4 lg:flex">
            <h1 className={cn(s.headline, 'max-w-[12ch] !text-[clamp(2.75rem,5vw,4.75rem)]')}>{title}</h1>
            <p className={cn(s.lede, 'max-w-[30rem] text-xl')}>{lede}</p>
          </div>
        </div>
        {clinics.length > 0 && <QuitoPanorama clinics={clinics} initial={clinics.map((c) => openState(c.schedule, c.closures))} />}
      </section>
      <main className={cn(s.gutter, 'flex items-center justify-center py-10 lg:py-16')}>{children}</main>
    </div>
  );
}
