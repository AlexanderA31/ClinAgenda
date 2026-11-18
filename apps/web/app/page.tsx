import Link from 'next/link';
import type { Metadata } from 'next';
import { CalendarCheck, FileText, MapPin, Phone, Pill, Timer, Users, UserRound } from 'lucide-react';
import { WEEKDAY_LABELS, type PublicDirectory } from '@clinagenda/schemas';
import s from '@/components/landing/landing.module.css';
import { OpenStatus } from '@/components/landing/open-status';
import { DoctorDirectory } from '@/components/landing/doctor-directory';
import { QuitoPanorama } from '@/components/landing/quito-panorama';
import { openState, quitoNow, scheduleLines } from '@/components/landing/hours';
import { initials, slug, toneClass } from '@/components/landing/tone';
import { dayLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getServerSession } from '@/lib/server-session';

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

type Clinic = PublicDirectory['clinics'][number];
type Doctor = PublicDirectory['doctors'][number];

/**
 * Quién atiende en cada clínica un día dado. Si hoy no hay atención (domingo o cierre), muestra el
 * próximo día con médicos, para que la sección nunca quede vacía.
 */
function attendingDay(data: PublicDirectory, clinics: Clinic[]) {
  const q = quitoNow();
  for (let offset = 0; offset < 7; offset++) {
    const weekday = (q.weekday + offset) % 7;
    const date = new Date(`${q.date}T12:00:00-05:00`);
    date.setUTCDate(date.getUTCDate() + offset);
    const iso = date.toISOString().slice(0, 10);
    const byClinic = clinics.map((c) => {
      const closed = c.closures.find((x) => x.date === iso);
      const doctors = closed
        ? []
        : data.doctors.flatMap((d) => {
            const slots = d.assignments.filter((a) => a.clinicId === c.id && a.weekday === weekday);
            return slots.length ? [{ doctor: d, hours: slots.map((a) => `${a.startTime} a ${a.endTime}`).join(' y ') }] : [];
          });
      return { clinic: c, closed, doctors };
    });
    const total = new Set(byClinic.flatMap((b) => b.doctors.map((x) => x.doctor.id))).size;
    if (total) return { offset, weekday, iso, byClinic, total };
  }
  return null;
}

function attendingTitle(day: NonNullable<ReturnType<typeof attendingDay>>) {
  const who = `${day.total} ${day.total === 1 ? 'médico' : 'médicos'}`;
  if (day.offset === 0) return `Hoy atienden ${who}`;
  if (day.offset === 1) return `Mañana atienden ${who}`;
  return `El ${WEEKDAY_LABELS[day.weekday].toLowerCase()} atienden ${who}`;
}

export default async function Landing() {
  const [data, session] = await Promise.all([getDirectory(), getServerSession()]);
  const clinics = data ? [...data.clinics].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name)) : [];
  const doctorCount = data?.doctors.filter((d) => d.assignments.length).length ?? 0;
  const day = data ? attendingDay(data, clinics) : null;
  // El mensaje de ejemplo usa un médico y una clínica reales, para que el paciente reconozca lo que va a recibir.
  const sampleClinic = clinics.find((c) => c.name === 'Clínica Centro') ?? clinics[0];
  const sampleDoctor: Doctor | undefined = data?.doctors.find((d) => d.assignments.some((a) => a.clinicId === sampleClinic?.id));

  return (
    <div className={cn(s.page, 'flex min-h-dvh flex-col')}>
      {/* Portada: el Pichincha detrás de la ciudad y las tres clínicas sobre la avenida */}
      <div className={s.hero}>
        <header className={cn(s.gutter, 'py-5')}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <Link href="/" className="font-display text-2xl font-extrabold">
              Clínicas Paredes
            </Link>
            <nav className="flex items-center gap-1" aria-label="Secciones">
              <a href="#hoy" className="hidden min-h-11 items-center px-3 font-bold opacity-85 hover:opacity-100 md:flex">
                Hoy
              </a>
              <a href="#clinicas" className="hidden min-h-11 items-center px-3 font-bold opacity-85 hover:opacity-100 md:flex">
                Clínicas
              </a>
              <a href="#medicos" className="hidden min-h-11 items-center px-3 font-bold opacity-85 hover:opacity-100 md:flex">
                Médicos
              </a>
              <a href="#citas" className="hidden min-h-11 items-center px-3 font-bold opacity-85 hover:opacity-100 md:flex">
                Su cita
              </a>
              {session ? (
                // Con la sesión abierta, la página lo reconoce y lleva directo a su pantalla.
                <Link href={session.home} className={cn(s.cta, 'ml-2 flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold')}>
                  <UserRound className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{session.name}:</span> {session.kind === 'staff' ? 'Ir a la agenda' : 'Mis citas'}
                </Link>
              ) : (
                <Link href="/ingresar" className={cn(s.ghost, 'ml-2 flex min-h-11 items-center rounded-full px-4 text-sm font-bold')}>
                  Ingresar
                </Link>
              )}
            </nav>
          </div>
        </header>

        <section className={cn(s.gutter, 'pb-6 pt-6 sm:pt-10')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-7">
            <h1 className={cn(s.headline, 'max-w-[11ch]')}>Su médico, de norte a sur de Quito.</h1>
            <div className="flex flex-col gap-6">
              <p className={cn(s.lede, 'max-w-[34rem] text-xl')}>
                Medicina familiar en tres clínicas, con {doctorCount || 'doce'} médicos y una sola agenda. Atendemos a niños, adultos y adultos mayores, tengan o no documento.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href="#hoy" className={cn(s.cta, 'flex min-h-14 items-center gap-2 rounded-full px-7 text-lg font-bold')}>
                  <CalendarCheck className="size-5" aria-hidden /> Quién atiende hoy
                </a>
                <a href="#citas" className={cn(s.ghost, 'flex min-h-14 items-center rounded-full px-7 text-lg font-bold')}>
                  Cómo pedir una cita
                </a>
              </div>
            </div>
          </div>
        </section>

        {clinics.length > 0 && <QuitoPanorama clinics={clinics} initial={clinics.map((c) => openState(c.schedule, c.closures))} />}
      </div>

      <main className="flex-1">
        {/* Quién atiende hoy, por clínica: lo primero que pregunta un paciente al llamar */}
        {day && (
          <section id="hoy" className={cn(s.gutter, 'scroll-mt-4 py-20')}>
            <div className="mx-auto flex max-w-6xl flex-col gap-10">
              <div className="flex flex-col gap-3">
                <h2 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">{attendingTitle(day)}</h2>
                <p className="text-xl text-ink-2 first-letter:uppercase">
                  {dayLabel(day.iso)}. Llame a la clínica y pida la primera hora libre con el médico que necesite.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                {day.byClinic.map(({ clinic, closed, doctors }) => (
                  <article key={clinic.id} className={cn(s.today, toneClass(clinic.name), 'flex min-w-0 flex-col')}>
                    <div className={cn(s.todayHead, 'flex items-baseline justify-between gap-3 px-5 py-4')}>
                      <h3 className="font-display text-2xl font-extrabold">{clinic.name.replace('Clínica ', '')}</h3>
                      <span className="font-bold">{closed ? 'Cerrada' : `${doctors.length} ${doctors.length === 1 ? 'médico' : 'médicos'}`}</span>
                    </div>
                    {closed ? (
                      <p className="p-5 text-ink-2">Cerrada este día: {closed.reason.toLowerCase()}.</p>
                    ) : doctors.length ? (
                      <ul className="flex flex-col divide-y divide-rule">
                        {doctors.map(({ doctor, hours }) => (
                          <li key={doctor.id} className="flex items-center gap-3 px-5 py-3">
                            <span className={cn(s.avatar, s.avatarSmall)} aria-hidden>
                              {initials(doctor.fullName)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold leading-tight">{doctor.fullName}</p>
                              <p className="text-ink-2">
                                {doctor.specialty}, de {hours}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="p-5 text-ink-2">No hay atención este día.</p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Las tres clínicas, cada una con su color */}
        <section id="clinicas" className={cn(s.gutter, 'scroll-mt-4 pb-20', !day && 'pt-20')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            <h2 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">Tres clínicas, una sola agenda</h2>
            {clinics.length ? (
              <div className="grid gap-5 lg:grid-cols-3">
                {clinics.map((c) => (
                  <article key={c.id} id={slug(c.name)} className={cn(s.clinic, toneClass(c.name), 'flex min-w-0 scroll-mt-4 flex-col gap-5 p-6 sm:p-8')}>
                    <h3 className={s.clinicName}>
                      <span className="sr-only">Clínica </span>
                      {c.name.replace('Clínica ', '')}
                    </h3>
                    <div className="[&_p]:!text-current">
                      <OpenStatus schedule={c.schedule} closures={c.closures} initial={openState(c.schedule, c.closures)} />
                    </div>
                    {c.address && (
                      <p className="flex items-start gap-2 text-lg">
                        <MapPin className="mt-1 size-5 shrink-0" aria-hidden />
                        {c.address}
                      </p>
                    )}
                    <ul className="flex flex-col gap-1">
                      {scheduleLines(c.schedule).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {c.closures[0] && (
                      <p className={cn(s.clinicNote, 'pt-4 font-bold first-letter:uppercase')}>
                        {dayLabel(c.closures[0].date)}: cerrado ({c.closures[0].reason.toLowerCase()})
                      </p>
                    )}
                    {c.phone && (
                      <a href={telHref(c.phone)} className={cn(s.clinicCall, 'mt-auto flex min-h-14 items-center justify-center gap-2 rounded-full px-5 text-lg font-bold')}>
                        <Phone className="size-5" aria-hidden /> Llamar al {telLabel(c.phone)}
                      </a>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-lg text-ink-2">En este momento no podemos mostrar los horarios. Por favor llame a su clínica.</p>
            )}
          </div>
        </section>

        {/* Médicos y dónde atiende cada uno */}
        <section id="medicos" className={cn(s.gutter, 'scroll-mt-4 bg-surface-2 py-20')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-8">
            <div className="flex max-w-2xl flex-col gap-3">
              <h2 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">Nuestros médicos</h2>
              <p className="text-xl text-ink-2">Algunos atienden en más de una clínica. Elija la que le quede más cerca para ver quién está y cuándo.</p>
            </div>
            {data ? <DoctorDirectory data={{ ...data, clinics }} /> : <p className="text-ink-2">Los horarios no están disponibles en este momento.</p>}
          </div>
        </section>

        {/* Cómo pedir, recibir y cancelar una cita: es una secuencia real, por eso va numerada */}
        <section id="citas" className={cn(s.gutter, 'scroll-mt-4 py-20')}>
          <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-10">
              <h2 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">Su cita, de principio a fin</h2>
              <ol className="flex flex-col gap-8">
                <li className="flex gap-5">
                  <span className={s.step} aria-hidden>
                    1
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-display text-2xl font-bold">Agende en línea o llame</h3>
                    <p className="text-lg text-ink-2">
                      Desde <strong>Ingresar</strong>, cree su cuenta con su cédula y elija clínica, médico y hora. O llame a su clínica: le damos la primera hora libre y, si no hay espacio pronto, le anotamos en la lista de espera.
                    </p>
                  </div>
                </li>
                <li className="flex gap-5">
                  <span className={s.step} aria-hidden>
                    2
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-display text-2xl font-bold">Reciba la confirmación</h3>
                    <p className="text-lg text-ink-2">Le enviamos por WhatsApp el día, la hora y la dirección, o se la entregamos impresa. El día anterior le recordamos la cita.</p>
                  </div>
                </li>
                <li className="flex gap-5">
                  <span className={s.step} aria-hidden>
                    3
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-display text-2xl font-bold">¿No puede venir? Cancele usted mismo</h3>
                    <p className="text-lg text-ink-2">Abra el enlace de su mensaje o escanee el código de su comprobante y cancele hasta dos horas antes. Así su espacio pasa a otro paciente que lo necesita.</p>
                  </div>
                </li>
              </ol>
            </div>

            {/* Así se ve el mensaje que recibe el paciente */}
            <figure className="flex flex-col items-center gap-4">
              <div className={s.phone}>
                <div className={cn(s.phoneBar, 'flex items-center gap-3 px-4 py-3')}>
                  <span className={cn(s.avatar, s.avatarSmall, s.toneSur)} aria-hidden>
                    CP
                  </span>
                  <div>
                    <p className="font-bold leading-tight">{sampleClinic?.name ?? 'Clínica Centro'}</p>
                    <p className="text-sm opacity-80">WhatsApp</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 p-4 pb-8">
                  <p className={cn(s.bubble, 'max-w-[92%] px-4 py-3 shadow-sm')}>
                    Hola, le saludamos de {sampleClinic?.name ?? 'Clínica Centro'}. Su cita con {sampleDoctor?.fullName ?? 'su médico'} quedó agendada para el jueves a las 09:30.
                    {sampleClinic?.address && <> Le esperamos en {sampleClinic.address}.</>}
                  </p>
                  <p className={cn(s.bubble, 'max-w-[92%] px-4 py-3 shadow-sm')}>
                    Si no puede venir, cancélela aquí para dar el espacio a otro paciente: <span className={cn(s.bubbleLink, 'font-bold underline')}>clinicasparedes.ec/c/7f3a…</span>
                  </p>
                </div>
              </div>
              <figcaption className="text-ink-2">Así se ve el mensaje de confirmación.</figcaption>
            </figure>
          </div>
        </section>

        <section className={cn(s.gutter, s.band, 'py-16')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            <h2 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">Qué traer el día de su cita</h2>
            <ul className="grid gap-8 text-lg sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: FileText, text: 'Su cédula o pasaporte. Si no tiene documento, igual le atendemos.' },
                { icon: Users, text: 'Los niños y adolescentes vienen con su madre, padre o representante.' },
                { icon: Pill, text: 'Exámenes y recetas anteriores, y las medicinas que toma.' },
                { icon: Timer, text: 'Llegue 10 minutos antes para registrarse con calma.' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex flex-col gap-3">
                  <span className={cn(s.bandMark, 'grid size-12 place-items-center rounded-full')} aria-hidden>
                    <Icon className="size-6" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className={cn(s.gutter, s.footer, 'py-14')}>
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <p className="font-display text-4xl font-extrabold text-[var(--hero-ink)]">Clínicas Paredes</p>
          <ul className="grid gap-8 sm:grid-cols-3">
            {clinics.map((c) => (
              <li key={c.id} className="flex flex-col gap-1">
                <strong className="flex items-center gap-2">
                  <span className={cn(s.dot, toneClass(c.name))} aria-hidden />
                  {c.name}
                </strong>
                {c.address && <span>{c.address}</span>}
                {c.phone && (
                  <a className="w-fit underline underline-offset-4" href={telHref(c.phone)}>
                    {telLabel(c.phone)}
                  </a>
                )}
              </li>
            ))}
          </ul>
          <p className="text-sm">Quito, Ecuador. Sus datos de salud solo los ve el personal que le atiende.</p>
        </div>
      </footer>
    </div>
  );
}
