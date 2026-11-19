import Link from 'next/link';
import type { Metadata } from 'next';
import '@fontsource-variable/bodoni-moda/index.css';
import { FileText, MapPin, Phone, Pill, Timer, UserRound, Users } from 'lucide-react';
import { WEEKDAY_LABELS, type PublicDirectory } from '@clinagenda/schemas';
import e from '@/components/landing/editorial.module.css';
import s from '@/components/landing/landing.module.css';
import { ContourFrame } from '@/components/landing/contour-frame';
import { DoctorDirectory } from '@/components/landing/doctor-directory';
import { OpenStatus } from '@/components/landing/open-status';
import { ScrollScene } from '@/components/landing/scroll-scene';
import { openState, quitoNow, scheduleLines } from '@/components/landing/hours';
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

/** Texto que se enciende palabra por palabra con el scroll (cada palabra en su propio span). */
function Words({ text, className }: { text: string; className?: string }) {
  return (
    <p data-words className={className}>
      {text.split(' ').map((w, i) => (
        <span key={i}>{w} </span>
      ))}
    </p>
  );
}

/** El orden de las clínicas en la avenida da su número de capítulo: es el recorrido real, de norte a sur. */
const ordinal = (i: number) => String(i + 1).padStart(2, '0');

export default async function Landing() {
  const [data, session] = await Promise.all([getDirectory(), getServerSession()]);
  // getDirectory ya las ordena de norte a sur (y las nuevas al final).
  const clinics = data?.clinics ?? [];
  const doctorCount = data?.doctors.filter((d) => d.assignments.length).length ?? 0;
  const day = data ? attendingDay(data, clinics) : null;
  // El mensaje de ejemplo usa un médico y una clínica reales, para que el paciente reconozca lo que va a recibir.
  const sampleClinic = clinics.find((c) => c.name === 'Clínica Centro') ?? clinics[0];
  const sampleDoctor: Doctor | undefined = data?.doctors.find((d) => d.assignments.some((a) => a.clinicId === sampleClinic?.id));
  // Paradas de la avenida, repartidas de arriba (norte) a abajo (sur).
  const stopY = (i: number) => 40 + (i * 520) / Math.max(1, clinics.length - 1);

  return (
    <div className={cn(e.page, s.night)}>
      <ScrollScene />
      <div className={e.grain} aria-hidden />

      <header className={cn(e.nav, e.gutter)}>
        <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4">
          <nav className="hidden items-center gap-7 md:flex" aria-label="Secciones">
            <a href="#hoy" className={e.navLink}>
              Hoy
            </a>
            <a href="#clinicas" className={e.navLink}>
              Clínicas
            </a>
            <a href="#medicos" className={e.navLink}>
              Médicos
            </a>
          </nav>
          <Link href="/" className={cn(e.brand, 'md:absolute md:left-1/2 md:-translate-x-1/2')}>
            Clínicas Paredes
          </Link>
          <div className="flex items-center gap-7">
            <a href="#citas" className={cn(e.navLink, 'hidden md:inline')}>
              Su cita
            </a>
            {session ? (
              // Con la sesión abierta, la página lo reconoce y lleva directo a su pantalla.
              <Link href={session.home} className={cn(e.cta, 'flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold')}>
                <UserRound className="size-4" aria-hidden />
                <span className="hidden sm:inline">{session.name}:</span> {session.kind === 'staff' ? 'Ir a la agenda' : 'Mis citas'}
              </Link>
            ) : (
              <Link href="/ingresar" className={cn(e.enter, 'flex min-h-11 items-center rounded-full px-5 text-sm font-bold')}>
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Portada: el titular a la izquierda y el Pichincha en curvas de nivel, con el sol, a la derecha */}
        <section className={cn(e.gutter, 'flex min-h-svh flex-col justify-end pb-12 pt-28')}>
          <div className="mx-auto grid w-full max-w-[90rem] items-end gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="flex flex-col gap-10">
              <h1 className={cn(e.display, e.hero)}>
                <span className={e.line}>
                  <span className={e.lineInner} data-hero-line>
                    Su médico,
                  </span>
                </span>
                <span className={e.line}>
                  <span className={e.lineInner} data-hero-line>
                    de norte a sur
                  </span>
                </span>
                <span className={e.line}>
                  <span className={e.lineInner} data-hero-line>
                    de Quito.
                  </span>
                </span>
              </h1>
              <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
                <p className={cn(e.lede, 'max-w-[32rem]')} data-hero-fade>
                  Medicina familiar en tres clínicas, con {doctorCount || 'doce'} médicos. Atendemos a niños, adultos y adultos mayores.
                </p>
                <div className="flex flex-wrap gap-3" data-hero-fade>
                  <a href="#hoy" className={cn(e.cta, 'flex min-h-14 items-center rounded-full px-7 text-lg font-bold')}>
                    Quién atiende hoy
                  </a>
                  <a href="#citas" className={cn(e.enter, 'flex min-h-14 items-center rounded-full px-7 text-lg font-bold')}>
                    Cómo pedir una cita
                  </a>
                </div>
              </div>
            </div>
            <div data-hero-fade className="hidden lg:block">
              <ContourFrame seed={7} sun className="aspect-[3/4] w-full" label="Pichincha, 4.784 m" />
            </div>
          </div>
          {/* Estado de cada clínica a la hora en que se mira */}
          <ul className={cn(e.rule, 'mx-auto mt-14 grid w-full max-w-[90rem] gap-4 border-t pt-5 sm:grid-cols-3')} data-hero-fade>
            {clinics.map((c) => (
              <li key={c.id} className={cn(toneClass(c.name), 'flex items-baseline justify-between gap-3')}>
                <a href={`#${slug(c.name)}`} className="flex items-center gap-2 font-bold">
                  <span className={e.tick} aria-hidden /> {c.name}
                </a>
                <OpenStatus schedule={c.schedule} closures={c.closures} initial={openState(c.schedule, c.closures)} />
              </li>
            ))}
          </ul>
        </section>

        {/* La frase que crece: la sección queda fija mientras el texto atraviesa la pantalla */}
        <section className={e.zoomWrap} aria-label="La mejor clinica del Pais">
          <p className={cn(e.zoom, e.gutter)} data-zoom>
            La mejor clinica
            <br />
            del pais.
          </p>
        </section>

        {/* Quién atiende hoy, por clínica: lo primero que pregunta un paciente al llamar */}
        {day && (
          <section id="hoy" className={cn(e.gutter, 'scroll-mt-20 py-28')}>
            <div className="mx-auto flex max-w-[90rem] flex-col gap-14">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
                <h2 className={cn(e.display, e.h2)} data-rise>
                  {attendingTitle(day)}
                </h2>
                <Words
                  className={cn(e.lede, 'max-w-xl')}
                  text={`${dayLabel(day.iso).replace(/^./, (c) => c.toUpperCase())}. Llame a la clínica y pida la primera hora libre con el médico que necesite.`}
                />
              </div>
              <div className="grid gap-x-10 gap-y-14 md:grid-cols-3">
                {day.byClinic.map(({ clinic, closed, doctors }, ci) => (
                  <div key={clinic.id} className={cn(toneClass(clinic.name), 'flex min-w-0 flex-col')} data-parallax={ci === 1 ? 6 : undefined}>
                    <div className={cn(e.rule, 'flex items-baseline justify-between gap-3 border-b pb-3')} data-rise>
                      <h3 className="flex items-center gap-2 text-2xl font-bold">
                        <span className={e.tick} aria-hidden /> {clinic.name.replace('Clínica ', '')}
                      </h3>
                      <span className={e.ink2}>{closed ? 'Cerrada' : `${doctors.length} ${doctors.length === 1 ? 'médico' : 'médicos'}`}</span>
                    </div>
                    {closed ? (
                      <p className={cn(e.ink2, 'pt-4')}>Cerrada este día: {closed.reason.toLowerCase()}.</p>
                    ) : doctors.length ? (
                      <ul className="flex flex-col">
                        {doctors.map(({ doctor, hours }) => (
                          <li key={doctor.id} className={cn(e.rule, 'flex items-center gap-4 border-b py-4')} data-rise>
                            <span className={cn(s.avatar, s.avatarSmall)} aria-hidden>
                              {initials(doctor.fullName)}
                            </span>
                            <div className="min-w-0">
                              <p className="text-lg font-bold leading-tight">{doctor.fullName}</p>
                              <p className={e.ink2}>
                                {doctor.specialty}, de {hours}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={cn(e.ink2, 'pt-4')}>No hay atención este día.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Las clínicas como paradas de una avenida, de norte a sur: la línea se dibuja con el scroll */}
        <section id="clinicas" className={cn(e.gutter, 'scroll-mt-20 py-28')}>
          <div className="mx-auto max-w-[90rem]">
            <h2 className={cn(e.display, e.h2, 'mb-16 max-w-4xl')} data-rise>
              De norte a sur, una parada cerca de usted
            </h2>
            {clinics.length ? (
              <div className="grid gap-10 lg:grid-cols-[9rem_minmax(0,1fr)]">
                <div className="hidden lg:block" aria-hidden>
                  <svg viewBox="0 0 140 600" className="sticky top-28 h-[min(70vh,600px)] w-full overflow-visible">
                    <path className={e.avenue} d="M40 20 C70 160 10 300 40 440 S50 560 40 590" />
                    <path className={e.avenueDrawn} d="M40 20 C70 160 10 300 40 440 S50 560 40 590" data-avenue-draw />
                    {clinics.map((c, i) => (
                      <g key={c.id}>
                        <circle className={e.stop} cx="40" cy={stopY(i)} r="9" data-avenue-stop={i} />
                        <text className={e.stopLabel} x="62" y={stopY(i) + 5} data-avenue-stop={i}>
                          {c.name.replace('Clínica ', '')}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
                <div className="flex flex-col gap-32" data-avenue-chapters>
                  {clinics.map((c, i) => (
                    <article key={c.id} id={slug(c.name)} data-chapter={i} className={cn(toneClass(c.name), 'grid scroll-mt-24 gap-10 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-center')}>
                      <div className="flex min-w-0 flex-col gap-6">
                        <p className={e.chapterNo} data-rise>
                          {ordinal(i)} / {ordinal(clinics.length - 1)}
                        </p>
                        <h3 className={e.clinicName} data-rise>
                          <span className="sr-only">Clínica </span>
                          {c.name.replace('Clínica ', '')}
                        </h3>
                        <div data-rise>
                          <OpenStatus schedule={c.schedule} closures={c.closures} initial={openState(c.schedule, c.closures)} />
                        </div>
                        {c.address && (
                          <p className="flex items-start gap-2 text-lg" data-rise>
                            <MapPin className="mt-1 size-5 shrink-0 text-[var(--tone)]" aria-hidden />
                            {c.address}
                          </p>
                        )}
                        <ul className={cn(e.rule, e.ink2, 'flex flex-col gap-1 border-l-2 pl-4')} data-rise>
                          {scheduleLines(c.schedule).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        {c.closures[0] && (
                          <p className="font-bold first-letter:uppercase" data-rise>
                            {dayLabel(c.closures[0].date)}: cerrado ({c.closures[0].reason.toLowerCase()})
                          </p>
                        )}
                        {c.phone && (
                          <a href={telHref(c.phone)} className={cn(e.call, 'flex min-h-14 w-fit items-center gap-2 rounded-full px-6 text-lg font-bold')} data-rise>
                            <Phone className="size-5" aria-hidden /> Llamar al {telLabel(c.phone)}
                          </a>
                        )}
                      </div>
                      <div data-parallax={8}>
                        <ContourFrame seed={11 + i * 17} className="aspect-[4/5] w-full" />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className={cn(e.ink2, 'text-lg')}>En este momento no podemos mostrar los horarios. Por favor llame a su clínica.</p>
            )}
          </div>
        </section>

        {/* Médicos y dónde atiende cada uno */}
        <section id="medicos" className={cn(e.gutter, 'scroll-mt-20 py-28')}>
          <div className="mx-auto flex max-w-[90rem] flex-col gap-12">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
              <h2 className={cn(e.display, e.h2)} data-rise>
                Nuestros médicos
              </h2>
              <Words className={cn(e.lede, 'max-w-xl')} text="Algunos atienden en más de una clínica. Elija la que le quede más cerca para ver quién está y cuándo." />
            </div>
            <div data-rise>{data ? <DoctorDirectory data={{ ...data, clinics }} /> : <p className={e.ink2}>Los horarios no están disponibles en este momento.</p>}</div>
          </div>
        </section>

        {/* Su cita, de principio a fin: una secuencia real, por eso numerada. En pantallas anchas se recorre de lado. */}
        <section id="citas" className="scroll-mt-20 overflow-hidden" data-hscroll>
          <div className={cn(e.gutter, 'flex min-h-svh flex-col justify-center gap-14 py-24')}>
            <h2 className={cn(e.display, e.h2, 'mx-auto w-full max-w-[90rem]')}>Su cita, de principio a fin</h2>
            <ol className={cn(e.hTrack, 'max-lg:!w-full max-lg:flex-col')} data-htrack>
              {[
                [
                  'Agende en línea o llame',
                  'Desde Ingresar, cree su cuenta con su cédula y elija clínica, médico y hora. O llame a su clínica: le damos la primera hora libre y, si no hay espacio pronto, le anotamos en la lista de espera.',
                ],
                ['Reciba la confirmación', 'La clínica revisa su pedido y le avisa en su cuenta y por WhatsApp, con el día, la hora y la dirección. El día anterior le recordamos la cita.'],
                [
                  '¿No puede venir? Cancele usted',
                  'Desde su cuenta, el enlace de su mensaje o el código de su comprobante, hasta dos horas antes. Así su espacio pasa a otro paciente que lo necesita.',
                ],
              ].map(([title, text], i) => (
                <li key={title} className={cn(e.hPanel, e.rule, 'flex flex-col gap-6 border-t pt-6 max-lg:w-full')}>
                  <span className={e.stepNo} aria-hidden>
                    {i + 1}
                  </span>
                  <h3 className="text-3xl font-bold">{title}</h3>
                  <p className={cn(e.lede, 'max-w-md')}>{text}</p>
                </li>
              ))}
              {/* Así se ve el mensaje que recibe el paciente */}
              <li className={cn(e.hPanel, 'flex flex-col items-center gap-4 max-lg:w-full')}>
                <figure className="flex flex-col items-center gap-4">
                  <div className={e.phone}>
                    <div className={cn(e.phoneBar, 'flex items-center gap-3 px-4 py-3')}>
                      <span className={cn(s.avatar, s.avatarSmall, s.toneSur)} aria-hidden>
                        CP
                      </span>
                      <div>
                        <p className="font-bold leading-tight">{sampleClinic?.name ?? 'Clínica Centro'}</p>
                        <p className="text-sm opacity-80">WhatsApp</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 p-4 pb-8">
                      <p className={cn(e.bubble, 'max-w-[92%] px-4 py-3')}>
                        Hola, le saludamos de {sampleClinic?.name ?? 'Clínica Centro'}. Su cita con {sampleDoctor?.fullName ?? 'su médico'} quedó agendada para el jueves a las 09:30.
                        {sampleClinic?.address && <> Le esperamos en {sampleClinic.address}.</>}
                      </p>
                      <p className={cn(e.bubble, 'max-w-[92%] px-4 py-3')}>
                        Si no puede venir, cancélela aquí para dar el espacio a otro paciente: <span className="font-bold text-[#98b0ff] underline">clinicasparedes.ec/c/7f3a…</span>
                      </p>
                    </div>
                  </div>
                  <figcaption className={e.ink2}>Así se ve el mensaje de confirmación.</figcaption>
                </figure>
              </li>
            </ol>
          </div>
        </section>

        <section className={cn(e.gutter, 'py-28')}>
          <div className="mx-auto flex max-w-[90rem] flex-col gap-12">
            <h2 className={cn(e.display, e.h2)} data-rise>
              Qué traer el día de su cita
            </h2>
            <ul className="grid gap-x-10 text-lg sm:grid-cols-2">
              {[
                { icon: FileText, text: 'Su cédula o pasaporte. Si no tiene documento, igual le atendemos.' },
                { icon: Users, text: 'Los niños y adolescentes vienen con su madre, padre o representante.' },
                { icon: Pill, text: 'Exámenes y recetas anteriores, y las medicinas que toma.' },
                { icon: Timer, text: 'Llegue 10 minutos antes para registrarse con calma.' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className={cn(e.rule, 'flex items-start gap-4 border-t py-6')} data-rise>
                  <Icon className="mt-1 size-6 shrink-0 text-[var(--maiz)]" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className={cn(e.rule, 'overflow-hidden border-t pt-20')}>
        <div className={cn(e.gutter, 'mx-auto grid max-w-[90rem] gap-10 sm:grid-cols-3')}>
          {clinics.map((c) => (
            <div key={c.id} className={cn(toneClass(c.name), 'flex flex-col gap-1', e.ink2)}>
              <strong className="flex items-center gap-2 text-[var(--ink)]">
                <span className={e.tick} aria-hidden />
                {c.name}
              </strong>
              {c.address && <span>{c.address}</span>}
              {c.phone && (
                <a className="w-fit text-[var(--ink)] underline underline-offset-4" href={telHref(c.phone)}>
                  {telLabel(c.phone)}
                </a>
              )}
            </div>
          ))}
        </div>
        <p className={cn(e.gutter, e.muted, 'mx-auto mt-10 max-w-[90rem] text-sm')}>Quito, Ecuador. Sus datos de salud solo los ve el personal que le atiende.</p>
        <p className={cn(e.giant, 'mt-12 pl-[2vw]')} aria-hidden data-giant>
          Clínicas Paredes
        </p>
      </footer>
    </div>
  );
}
