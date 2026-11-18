import Link from 'next/link';
import type { Metadata } from 'next';
import { CalendarCheck, MapPin, Phone } from 'lucide-react';
import type { PublicDirectory } from '@clinagenda/schemas';
import s from '@/components/landing/landing.module.css';
import { OpenStatus } from '@/components/landing/open-status';
import { DoctorDirectory } from '@/components/landing/doctor-directory';
import { openState, scheduleLines } from '@/components/landing/hours';
import { dayLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: { absolute: 'Clínicas Paredes' },
  description: 'Clínica Norte, Centro y Sur: horarios, médicos y cómo pedir o cancelar su cita.',
};

// La información viene del sistema de citas: si la doctora cambia un horario o agrega un médico,
// la página se actualiza sola (se consulta como máximo cada 5 minutos).
export const dynamic = 'force-dynamic';

async function getDirectory(): Promise<PublicDirectory | null> {
  try {
    const res = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/api/public/directory`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as PublicDirectory) : null;
  } catch {
    return null;
  }
}

// De norte a sur, como está la ciudad.
const ORDER = ['Clínica Norte', 'Clínica Centro', 'Clínica Sur'];

function telHref(phone: string) {
  return `tel:${phone.replace(/\D/g, '')}`;
}

/** "022456789" -> "02 245 6789", como se dicta en Quito. */
function telLabel(phone: string) {
  return phone.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3');
}

export default async function Landing() {
  const data = await getDirectory();
  const clinics = data ? [...data.clinics].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name)) : [];
  const doctorCount = data?.doctors.filter((d) => d.assignments.length).length ?? 0;

  return (
    <div className={cn(s.page, 'flex min-h-dvh flex-col')}>
      <header className={cn(s.gutter, 'py-4')}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/" className="font-display text-2xl font-extrabold text-[var(--euc)]">
            Clínicas Paredes
          </Link>
          <nav className="flex items-center gap-1" aria-label="Secciones">
            <a href="#medicos" className="hidden min-h-11 items-center px-3 font-bold text-ink-2 hover:text-ink sm:flex">
              Médicos
            </a>
            <a href="#citas" className="hidden min-h-11 items-center px-3 font-bold text-ink-2 hover:text-ink sm:flex">
              Su cita
            </a>
            <Link href="/ingresar" className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold text-ink-3 hover:text-ink">
              <span className="sm:hidden">Personal</span>
              <span className="hidden sm:inline">Acceso del personal</span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Portada: Quito de norte a sur, con las tres clínicas y si están abiertas ahora */}
        <section className={cn(s.gutter, 'pb-16 pt-6 sm:pt-10')}>
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-6 lg:sticky lg:top-8">
              <h1 className={s.headline}>Medicina familiar en el norte, el centro y el sur de Quito.</h1>
              <p className="max-w-[34rem] text-xl text-ink-2">
                Tres clínicas, {doctorCount || 'doce'} médicos y una sola agenda. Atendemos a niños, adultos y adultos mayores.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href="#citas" className="flex min-h-14 items-center gap-2 rounded-md bg-ballpoint px-6 text-lg font-bold text-ballpoint-ink hover:brightness-110">
                  <CalendarCheck className="size-5" aria-hidden /> Cómo pedir una cita
                </a>
                <a href="#medicos" className="flex min-h-14 items-center rounded-md border-2 border-rule-strong px-6 text-lg font-bold hover:border-[var(--euc)]">
                  Ver médicos y horarios
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <p className={s.terminal}>Norte de la ciudad</p>
              {clinics.length ? (
                <ol className={s.strip} aria-label="Nuestras clínicas, de norte a sur">
                  {clinics.map((c) => (
                    <li key={c.id} className={cn(s.stop, 'flex flex-col gap-2')}>
                      <h2 className="font-display text-3xl font-extrabold leading-none">{c.name}</h2>
                      <OpenStatus schedule={c.schedule} closures={c.closures} initial={openState(c.schedule, c.closures)} />
                      {c.address && (
                        <p className="flex items-start gap-2 text-ink-2">
                          <MapPin className="mt-1 size-5 shrink-0" aria-hidden />
                          {c.address}
                        </p>
                      )}
                      <ul className="text-ink-2">
                        {scheduleLines(c.schedule).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      {c.closures[0] && (
                        <p className="font-bold text-warn first-letter:uppercase">
                          {dayLabel(c.closures[0].date)}: cerrado ({c.closures[0].reason.toLowerCase()})
                        </p>
                      )}
                      {c.phone && (
                        <a href={telHref(c.phone)} className="mt-1 flex min-h-12 w-fit items-center gap-2 rounded-md border-2 border-[var(--euc)] px-4 font-bold text-[var(--euc)] hover:bg-[var(--euc)] hover:text-[var(--euc-ink)]">
                          <Phone className="size-5" aria-hidden /> Llamar al {telLabel(c.phone)}
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-ink-2">En este momento no podemos mostrar los horarios. Por favor llame a su clínica.</p>
              )}
              <p className={s.terminal}>Sur de la ciudad</p>
            </div>
          </div>
        </section>

        {/* Médicos y dónde atiende cada uno */}
        <section id="medicos" className={cn(s.gutter, 'scroll-mt-4 bg-surface py-16')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-8">
            <div className="flex max-w-2xl flex-col gap-3">
              <h2 className="font-display text-4xl font-extrabold">Médicos y horarios</h2>
              <p className="text-lg text-ink-2">Algunos médicos atienden en más de una clínica. Elija la que le quede más cerca para ver quién está y cuándo.</p>
            </div>
            {data ? <DoctorDirectory data={data} /> : <p className="text-ink-2">Los horarios no están disponibles en este momento.</p>}
          </div>
        </section>

        {/* Cómo pedir, recibir y cancelar una cita: es una secuencia real, por eso va numerada */}
        <section id="citas" className={cn(s.gutter, 'scroll-mt-4 py-16')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            <h2 className="max-w-2xl font-display text-4xl font-extrabold">Su cita, de principio a fin</h2>
            <ol className="grid gap-10 md:grid-cols-3">
              <li className="flex flex-col gap-3">
                <span className={s.stepNumber} aria-hidden>
                  1
                </span>
                <h3 className="font-display text-xl font-bold">Llame a su clínica</h3>
                <p className="text-ink-2">Le damos la primera hora libre con el médico que necesite. Si no hay espacio pronto, le anotamos en la lista de espera y le llamamos cuando se libere uno.</p>
              </li>
              <li className="flex flex-col gap-3">
                <span className={s.stepNumber} aria-hidden>
                  2
                </span>
                <h3 className="font-display text-xl font-bold">Reciba la confirmación</h3>
                <p className="text-ink-2">Le enviamos por WhatsApp el día, la hora y la dirección, o se la entregamos impresa. El día anterior le recordamos la cita.</p>
              </li>
              <li className="flex flex-col gap-3">
                <span className={s.stepNumber} aria-hidden>
                  3
                </span>
                <h3 className="font-display text-xl font-bold">¿No puede venir? Cancele usted mismo</h3>
                <p className="text-ink-2">Abra el enlace de su mensaje o escanee el código de su comprobante y cancele hasta dos horas antes. Así su espacio pasa a otro paciente que lo necesita.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className={cn(s.gutter, s.band, 'py-14')}>
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 className="font-display text-3xl font-extrabold">Qué traer el día de su cita</h2>
            <ul className="grid gap-x-10 gap-y-4 text-lg sm:grid-cols-2">
              <li>Su cédula o pasaporte. Si no tiene documento, igual le atendemos.</li>
              <li>Los niños y adolescentes vienen con su madre, padre o representante.</li>
              <li>Exámenes y recetas anteriores, y las medicinas que toma.</li>
              <li>Llegue 10 minutos antes para registrarse con calma.</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className={cn(s.gutter, 'py-10')}>
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <ul className="grid gap-6 sm:grid-cols-3">
            {clinics.map((c) => (
              <li key={c.id} className="flex flex-col gap-1">
                <p className="font-bold">{c.name}</p>
                {c.address && <p className="text-ink-2">{c.address}</p>}
                {c.phone && (
                  <a className="w-fit text-ink-2 underline underline-offset-4 hover:text-ink" href={telHref(c.phone)}>
                    {telLabel(c.phone)}
                  </a>
                )}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-3">Clínicas Paredes, Quito. Sus datos de salud solo los ve el personal que le atiende.</p>
        </div>
      </footer>
    </div>
  );
}
