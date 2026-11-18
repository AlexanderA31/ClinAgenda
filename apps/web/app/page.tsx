import Link from 'next/link';
import type { Metadata } from 'next';
import { CalendarCheck, Clock, FileText, MapPin, Phone, Pill, Timer, Users, UserRound } from 'lucide-react';
import { WEEKDAY_LABELS, type PublicDirectory } from '@clinagenda/schemas';
import s from '@/components/landing/landing.module.css';
import { OpenStatus } from '@/components/landing/open-status';
import { DoctorDirectory } from '@/components/landing/doctor-directory';
import { QuitoBackdrop } from '@/components/landing/quito-backdrop';
import { Reveal } from '@/components/landing/reveal';
import { openState, quitoNow, scheduleLines } from '@/components/landing/hours';
import { ClinicStops } from '@/components/landing/clinic-stops';
import { initials, slug, toneClass } from '@/components/landing/tone';
import { dayLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getServerSession } from '@/lib/server-session';
import { getDirectory } from '@/lib/directory';

export const metadata: Metadata = { title: { absolute: 'Clínicas Paredes' }, description: 'Clínica Norte, Centro y Sur: horarios, médicos y cómo pedir o cancelar su cita.' };

// La información viene del sistema de citas: si la doctora cambia un horario o agrega un médico,
// la página se actualiza sola (se consulta como máximo cada 5 minutos).
export const dynamic = 'force-dynamic';

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

/** Título de sección: va sobre el cielo, sin panel, para que el paisaje se vea entre bloque y bloque. */
function SectionTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div data-reveal className={cn(s.reveal, 'flex max-w-3xl flex-col gap-3')}>
      <h2 className="font-display text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">{title}</h2>
      {children && <p className="text-xl text-ink-2">{children}</p>}
    </div>
  );
}

export default async function Landing() {
  const [data, session] = await Promise.all([getDirectory(), getServerSession()]);
  // getDirectory ya las ordena de norte a sur (y las nuevas al final).
  const clinics = data?.clinics ?? [];
  const doctorCount = data?.doctors.filter((d) => d.assignments.length).length ?? 0;
  const day = data ? attendingDay(data, clinics) : null;
  const states = clinics.map((c) => openState(c.schedule, c.closures));
  // El mensaje de ejemplo usa un médico y una clínica reales, para que el paciente reconozca lo que va a recibir.
  const sampleClinic = clinics.find((c) => c.name === 'Clínica Centro') ?? clinics[0];
  const sampleDoctor: Doctor | undefined = data?.doctors.find((d) => d.assignments.some((a) => a.clinicId === sampleClinic?.id));

  return (
    <div className={cn(s.page, s.night, 'relative flex min-h-dvh flex-col')}>
      {/* El Pichincha queda fijo detrás de toda la página; la información sube por encima. */}
      {clinics.length > 0 && <QuitoBackdrop clinics={clinics} initial={states} />}
      <Reveal />

      <header className={cn(s.sticky, s.gutter, 'py-3')}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/" className="whitespace-nowrap font-display text-xl font-extrabold sm:text-2xl">
            Clínicas Paredes
          </Link>
          <nav className="flex items-center gap-1" aria-label="Secciones">
            {[
              ['#hoy', 'Hoy'],
              ['#clinicas', 'Clínicas'],
              ['#medicos', 'Médicos'],
              ['#citas', 'Su cita'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="hidden min-h-11 items-center rounded-full px-3 font-bold text-ink-2 hover:text-ink md:flex">
                {label}
              </a>
            ))}
            {session ? (
              // Con la sesión abierta, la página lo reconoce y lleva directo a su pantalla.
              <Link href={session.home} className={cn(s.cta, 'ml-2 flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold')}>
                <UserRound className="size-4" aria-hidden />
                <span className="hidden sm:inline">{session.name}:</span> {session.kind === 'staff' ? 'Ir a la agenda' : 'Mis citas'}
              </Link>
            ) : (
              <Link href="/ingresar" className={cn(s.ghost, 'ml-2 flex min-h-11 items-center rounded-full px-5 text-sm font-bold')}>
                Ingresar
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        {/* Portada: ocupa la pantalla; abajo, el nombre de cada clínica sobre su parada en la avenida */}
        <section className={cn(s.cover, s.gutter, 'flex flex-col justify-between gap-10 pt-12 sm:pt-20')}>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
            <h1 className={cn(s.headline, 'max-w-[11ch]')}>Su médico, de norte a sur de Quito.</h1>
            <p className={cn(s.lede, 'max-w-[34rem] text-xl')}>Medicina familiar en tres clínicas, con {doctorCount || 'doce'} médicos. Atendemos a niños, adultos y adultos mayores.</p>
            <div className="flex flex-wrap gap-3">
              <a href="#hoy" className={cn(s.cta, 'flex min-h-14 items-center gap-2 rounded-full px-7 text-lg font-bold')}>
                <CalendarCheck className="size-5" aria-hidden /> Quién atiende hoy
              </a>
              <a href="#citas" className={cn(s.ghost, 'flex min-h-14 items-center rounded-full px-7 text-lg font-bold')}>
                Cómo pedir una cita
              </a>
            </div>
          </div>
          {clinics.length > 0 && <ClinicStops clinics={clinics} initial={states} />}
        </section>

        {/* Quién atiende hoy, por clínica: lo primero que pregunta un paciente al llamar */}
        {day && (
          <section id="hoy" className={cn(s.gutter, 'scroll-mt-20 py-24')}>
            <div className="mx-auto flex max-w-6xl flex-col gap-10">
              <SectionTitle title={attendingTitle(day)}>
                <span className="first-letter:uppercase">{dayLabel(day.iso)}</span>. Llame a la clínica y pida la primera hora libre con el médico que necesite.
              </SectionTitle>
              <div className="grid gap-5 md:grid-cols-3">
                {day.byClinic.map(({ clinic, closed, doctors }) => (
                  <article key={clinic.id} data-reveal className={cn(s.reveal, s.panel, s.toned, toneClass(clinic.name), 'flex min-w-0 flex-col')}>
                    <div className="flex items-baseline justify-between gap-3 border-b border-rule px-5 py-4">
                      <h3 className="font-display text-2xl font-extrabold">{clinic.name.replace('Clínica ', '')}</h3>
                      <span className="font-bold text-ink-2">{closed ? 'Cerrada' : `${doctors.length} ${doctors.length === 1 ? 'médico' : 'médicos'}`}</span>
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

        {/* Las clínicas: dónde quedan, si están abiertas y su horario de la semana */}
        <section id="clinicas" className={cn(s.gutter, 'scroll-mt-20 py-24')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            <SectionTitle title="Tres clínicas, una sola agenda">Su historia y sus citas están en las tres: puede atenderse en la que le quede más cerca.</SectionTitle>
            {clinics.length ? (
              <div className="grid gap-5 lg:grid-cols-3">
                {clinics.map((c) => (
                  <article key={c.id} id={slug(c.name)} data-reveal className={cn(s.reveal, s.panel, s.toned, toneClass(c.name), 'flex min-w-0 scroll-mt-20 flex-col gap-5 p-6 sm:p-7')}>
                    <div className="flex flex-col gap-2">
                      <h3 className="font-display text-4xl font-extrabold tracking-tight">{c.name}</h3>
                      <OpenStatus schedule={c.schedule} closures={c.closures} initial={openState(c.schedule, c.closures)} />
                    </div>
                    {c.address && (
                      <p className="flex items-start gap-2 text-lg">
                        <MapPin className="mt-1 size-5 shrink-0 text-[var(--tone)]" aria-hidden />
                        {c.address}
                      </p>
                    )}
                    <div className="flex items-start gap-2">
                      <Clock className="mt-1 size-5 shrink-0 text-[var(--tone)]" aria-hidden />
                      <ul className="flex flex-col gap-1 text-ink-2">
                        {scheduleLines(c.schedule).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                    {c.closures[0] && (
                      <p className="border-t border-rule pt-4 font-bold first-letter:uppercase">
                        {dayLabel(c.closures[0].date)}: cerrado ({c.closures[0].reason.toLowerCase()})
                      </p>
                    )}
                    {c.phone && (
                      <a href={telHref(c.phone)} className={cn(s.outline, 'mt-auto flex min-h-14 items-center justify-center gap-2 rounded-full px-5 text-lg font-bold')}>
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
        <section id="medicos" className={cn(s.gutter, 'scroll-mt-20 py-24')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            <SectionTitle title="Nuestros médicos">Algunos atienden en más de una clínica. Elija la que le quede más cerca para ver quién está y cuándo.</SectionTitle>
            <div data-reveal className={s.reveal}>
              {data ? <DoctorDirectory data={{ ...data, clinics }} /> : <p className="text-ink-2">Los horarios no están disponibles en este momento.</p>}
            </div>
          </div>
        </section>

        {/* Cómo pedir, recibir y cancelar una cita: es una secuencia real, por eso va numerada */}
        <section id="citas" className={cn(s.gutter, 'scroll-mt-20 py-24')}>
          <div className={cn(s.panel, 'mx-auto grid max-w-6xl items-center gap-14 p-6 sm:p-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]')}>
            <div className="flex flex-col gap-10">
              <h2 data-reveal className={cn(s.reveal, 'font-display text-4xl font-extrabold tracking-tight sm:text-6xl')}>
                Su cita, de principio a fin
              </h2>
              <ol className="flex flex-col gap-8">
                {[
                  [
                    'Agende en línea o llame',
                    <>
                      Desde <strong className="text-ink">Ingresar</strong>, cree su cuenta con su cédula y elija clínica, médico y hora. O llame a su clínica: le damos la primera hora libre y, si no
                      hay espacio pronto, le anotamos en la lista de espera.
                    </>,
                  ],
                  ['Reciba la confirmación', 'La clínica revisa su pedido y le avisa en su cuenta y por WhatsApp, con el día, la hora y la dirección. El día anterior le recordamos la cita.'],
                  [
                    '¿No puede venir? Cancele usted mismo',
                    'Desde su cuenta, el enlace de su mensaje o el código de su comprobante, hasta dos horas antes. Así su espacio pasa a otro paciente que lo necesita.',
                  ],
                ].map(([title, text], i) => (
                  <li key={i} data-reveal className={cn(s.reveal, 'flex gap-5')}>
                    <span className={s.step} aria-hidden>
                      {i + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-display text-2xl font-bold">{title}</h3>
                      <p className="text-lg text-ink-2">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Así se ve el mensaje que recibe el paciente */}
            <figure data-reveal className={cn(s.reveal, 'flex flex-col items-center gap-4')}>
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

        <section className={cn(s.gutter, 'py-24')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            <SectionTitle title="Qué traer el día de su cita" />
            <ul className="grid gap-5 text-lg sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: FileText, text: 'Su cédula o pasaporte. Si no tiene documento, igual le atendemos.' },
                { icon: Users, text: 'Los niños y adolescentes vienen con su madre, padre o representante.' },
                { icon: Pill, text: 'Exámenes y recetas anteriores, y las medicinas que toma.' },
                { icon: Timer, text: 'Llegue 10 minutos antes para registrarse con calma.' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} data-reveal className={cn(s.reveal, s.panel, 'flex flex-col gap-4 p-6')}>
                  <span className={cn(s.mark, 'grid size-12 place-items-center rounded-full')} aria-hidden>
                    <Icon className="size-6" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className={cn(s.gutter, 'relative z-10 border-t border-rule bg-[var(--night)] py-14 text-ink-2')}>
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <p className="font-display text-4xl font-extrabold text-ink">Clínicas Paredes</p>
          <ul className="grid gap-8 sm:grid-cols-3">
            {clinics.map((c) => (
              <li key={c.id} className="flex flex-col gap-1">
                <strong className="flex items-center gap-2 text-ink">
                  <span className={cn(s.dot, toneClass(c.name))} aria-hidden />
                  {c.name}
                </strong>
                {c.address && <span>{c.address}</span>}
                {c.phone && (
                  <a className="w-fit text-ink underline underline-offset-4" href={telHref(c.phone)}>
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
