import Link from 'next/link';
import s from '@/components/landing/landing.module.css';
import { QuitoPanorama } from '@/components/landing/quito-panorama';
import { openState } from '@/components/landing/hours';
import { getDirectory } from '@/lib/directory';
import { cn } from '@/lib/utils';

/**
 * Marco de "Ingresar" y "Crear mi cuenta": Quito a la izquierda y el formulario a la derecha,
 * en una sola pantalla sin desplazamiento. En celular queda solo la franja de la marca arriba.
 */
export async function AuthSplit({ title, lede, children }: { title: string; lede: string; children: React.ReactNode }) {
  const clinics = (await getDirectory())?.clinics ?? [];
  return (
    <div className={cn(s.page, 'grid min-h-dvh lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:overflow-hidden')}>
      <section className={cn(s.hero, 'flex flex-col justify-between lg:min-h-0')}>
        <div className={cn(s.gutter, 'flex flex-col gap-5 py-4 lg:pt-8')}>
          <Link href="/" className="w-fit font-display text-2xl font-extrabold">
            Clínicas Paredes
          </Link>
          <div className="hidden flex-col gap-3 lg:flex">
            <h1 className={cn(s.headline, 'max-w-[12ch] !text-[clamp(2.5rem,4.5vw,4.25rem)]')}>{title}</h1>
            <p className={cn(s.lede, 'max-w-[30rem] text-lg')}>{lede}</p>
          </div>
        </div>
        {clinics.length > 0 && (
          <div className={cn(s.authPanorama, 'hidden lg:block')}>
            <QuitoPanorama clinics={clinics} initial={clinics.map((c) => openState(c.schedule, c.closures))} />
          </div>
        )}
      </section>
      <main className={cn(s.gutter, 'flex items-center justify-center py-6 lg:min-h-0 lg:overflow-y-auto')}>{children}</main>
    </div>
  );
}
