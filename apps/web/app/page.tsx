import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, BookOpenText, CloudOff, Fingerprint, LogIn, ShieldCheck, Undo2, Users } from 'lucide-react';
import s from '@/components/landing/landing.module.css';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'ClinAgenda — Clínica Centro, Norte y Sur',
  description: 'La agenda de citas que reemplaza al cuaderno y al WhatsApp en las clínicas de la Dra. Paredes.',
};

const NOTEBOOK = [
  { t: '8:30', who: 'Sra. Mora — control presión' },
  { t: '9:00', who: 'Juan Pérez 099 123 45..', clash: true },
  { t: '9:00', who: 'Sr. Pérez (whatsapp) ¿el mismo?', clash: true },
  { t: '10:15', who: 'Valentina (niña) — sin cédula' },
  { t: '11:00', who: 'Dr. Salazar → ¿Norte o Centro?' },
];

const AGENDA = [
  { t: '08:30', who: 'Mercedes Mora', note: 'Control de presión', state: 'Agendada' },
  { t: '09:00', who: 'Juan Carlos Pérez', note: 'Ficha P-00042 · misma persona', state: 'Agendada' },
  { t: '09:30', who: 'Valentina Guamán', note: 'Menor · representante: su madre', state: 'Agendada' },
  { t: '10:00', who: 'Libre', note: '2 pacientes en lista de espera', state: 'Libre' },
];

// Horario real de los datos de demostración: lun-mié-vie en Centro por la mañana, mar-jue en Norte, lunes tarde en Norte.
const SALAZAR = [
  { day: 1, clinic: 'Centro', from: '08:00', to: '13:00' },
  { day: 1, clinic: 'Norte', from: '14:30', to: '17:30' },
  { day: 2, clinic: 'Norte', from: '08:00', to: '16:00' },
  { day: 3, clinic: 'Centro', from: '08:00', to: '13:00' },
  { day: 4, clinic: 'Norte', from: '08:00', to: '16:00' },
  { day: 5, clinic: 'Centro', from: '08:00', to: '13:00' },
];
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const CLINICS = ['Centro', 'Norte', 'Sur'];

const CASES = [
  {
    Icon: Users,
    when: 'Dos recepcionistas dan la misma hora, en el mismo segundo',
    then: 'La primera queda guardada. La segunda ve “ese horario acaba de ocuparse” y elige otra. Lo decide la base de datos, no la suerte de quién presionó primero.',
  },
  {
    Icon: CloudOff,
    when: 'Se cae el internet en la Clínica Sur a mitad de una cita',
    then: 'La agenda que ya estaba abierta se sigue viendo. La cita nueva queda “pendiente de enviar”, con un aviso amarillo, y se envía sola al volver la conexión. Nunca se muestra como confirmada antes de tiempo.',
  },
  {
    Icon: Undo2,
    when: 'Alguien cancela una cita por error',
    then: 'Aparece un botón “Deshacer”. Las citas nunca se borran: quedan como canceladas, con quién, cuándo y por qué. Cancelar dos veces no rompe nada.',
  },
  {
    Icon: Fingerprint,
    when: 'Escriben la cédula 0000000000, o con un número de menos',
    then: 'Se revisa provincia y dígito verificador. El mensaje dice qué está mal y el resto del formulario no se borra.',
  },
  {
    Icon: BookOpenText,
    when: '“Juan Pérez” llama otra vez, o hay dos con el mismo nombre',
    then: 'Antes de crear una ficha nueva, el sistema muestra los pacientes parecidos (nombre sin tildes, fecha de nacimiento, teléfono) y la recepcionista confirma.',
  },
  {
    Icon: ShieldCheck,
    when: 'Alguien ajeno quiere ver la información médica',
    then: 'Cada persona entra con su propio usuario. Recepción ve agenda y teléfonos, no notas clínicas. Todo cambio queda en una bitácora que nadie puede editar.',
  },
];

export default function Landing() {
  return (
    <div className="flex flex-col">
      <header className={cn(s.gutter, 'border-b border-rule bg-paper py-3')}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <span className="font-display text-xl font-extrabold text-ballpoint">ClinAgenda</span>
          <nav className="flex items-center gap-2">
            <a href="#casos" className="hidden min-h-11 items-center px-3 font-bold text-ink-2 hover:text-ink sm:flex">
              Qué resuelve
            </a>
            <Link href="/ingresar" className="flex min-h-11 items-center gap-2 rounded-md bg-ballpoint px-4 font-bold text-ballpoint-ink hover:brightness-110">
              <LogIn className="size-5" aria-hidden /> Ingresar
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero: el cuaderno con citas cruzadas, y la misma mañana ya ordenada */}
        <section className={cn(s.gutter, 'py-12 sm:py-16')}>
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">Clínica Centro · Clínica Norte · Clínica Sur</p>
              <h1 className="font-display text-5xl font-extrabold leading-[1.02] sm:text-6xl">
                Ninguna cita cruzada.
                <br />
                <span className="text-ballpoint">Ninguna cita perdida.</span>
              </h1>
              <p className="max-w-[34rem] text-xl text-ink-2">
                El cuaderno y el WhatsApp funcionaron mientras eran pocos pacientes. Con 12 médicos, 3 clínicas y unas 400 personas al mes, hace falta una agenda que no deje
                dar la misma hora dos veces y que doña Rosa pueda usar sin ayuda.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/ingresar" className="flex min-h-14 items-center gap-2 rounded-md bg-ballpoint px-6 text-lg font-bold text-ballpoint-ink hover:brightness-110">
                  Abrir la agenda <ArrowRight className="size-5" aria-hidden />
                </Link>
                <a href="#casos" className="flex min-h-14 items-center rounded-md border-2 border-rule-strong px-6 text-lg font-bold hover:border-ballpoint hover:text-ballpoint">
                  Qué pasa si algo falla
                </a>
              </div>
            </div>

            <div className="relative mx-auto flex w-full min-w-0 max-w-[34rem] flex-col" aria-label="Antes y después">
              <figure className={cn(s.notebook, 'w-[92%] px-4 pb-10 pt-5')} aria-label="Página de cuaderno con citas cruzadas">
                <figcaption className={cn(s.hand, 'pl-12 text-ink-2')} style={{ color: 'var(--ink-2)' }}>
                  Lunes 23
                </figcaption>
                <ul>
                  {NOTEBOOK.map((e, i) => (
                    <li key={i} className={cn(s.hand, 'relative flex gap-3')}>
                      <span className="w-10 shrink-0 text-right">{e.t}</span>
                      <span className="relative min-w-0 truncate">
                        {e.who}
                        {e.clash && i === 2 && (
                          <svg className={s.strike} viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden>
                            <path d="M2 9 C 80 2, 160 13, 240 6 S 360 3, 398 8" />
                          </svg>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className={cn(s['margin-note'], 'absolute right-3 top-[8.2rem] hidden sm:block')}>¡cruzada!</p>
                <div className={cn(s.sticky, 'absolute -right-6 top-10 hidden rounded-sm px-3 py-2 sm:block')}>
                  <p className={s.hand} style={{ color: 'var(--ink-2)', fontSize: '1.15rem', lineHeight: 1.3 }}>
                    llamar a la mamá
                    <br />
                    — ¿qué teléfono era?
                  </p>
                </div>
              </figure>

              <figure className={cn(s.agenda, 'relative -mt-14 ml-auto flex w-[88%] flex-col rounded-lg border border-rule bg-surface shadow-xl')} aria-label="La misma mañana en ClinAgenda">
                <figcaption className="flex items-baseline justify-between border-b border-rule px-4 py-3">
                  <span className="font-bold">Dr. Ernesto Salazar</span>
                  <span className="text-sm text-ink-3">Centro · lunes 23</span>
                </figcaption>
                <ol>
                  {AGENDA.map((r) => (
                    <li key={r.t} className="flex items-start gap-3 border-b border-rule/70 px-4 py-2.5 last:border-0">
                      <span className="w-12 pt-0.5 font-mono font-medium">{r.t}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn('font-bold', r.state === 'Libre' && 'text-ink-3')}>{r.who}</span>
                        <span className="truncate text-sm text-ink-2">{r.note}</span>
                      </span>
                      <span className={cn('rounded-sm px-2 py-0.5 text-xs font-bold', r.state === 'Libre' ? 'bg-surface-2 text-ink-3' : 'bg-ballpoint-soft text-ballpoint')}>{r.state}</span>
                    </li>
                  ))}
                </ol>
              </figure>
            </div>
          </div>
        </section>

        {/* La semana del Dr. Salazar: un médico, dos clínicas, nunca a la vez */}
        <section className={cn(s.gutter, 'border-y border-rule bg-surface py-14')}>
          <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-6">
            <div className="flex max-w-3xl flex-col gap-2">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">Un médico, dos clínicas</p>
              <h2 className="font-display text-4xl font-extrabold">La semana del Dr. Salazar</h2>
              <p className="text-lg text-ink-2">
                Atiende en Centro y en Norte. El lunes está en las dos, pero en horarios distintos. Si alguien intenta darle una cita en Norte mientras está en Centro, el sistema
                responde: <em className="not-italic font-bold text-ink">“Ernesto Salazar a esa hora atiende en Clínica Centro, no en Clínica Norte.”</em>
              </p>
            </div>
            <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-rule">
              <div className={cn(s.week, 'text-sm')}>
                <div className="border-b border-r border-rule bg-surface-2 p-2" />
                {DAYS.map((d) => (
                  <div key={d} className="border-b border-rule bg-surface-2 p-2 font-bold">
                    {d}
                  </div>
                ))}
                {CLINICS.map((c) => (
                  <div key={c} className="contents">
                    <div className="border-b border-r border-rule p-2 font-bold">Clínica {c}</div>
                    {DAYS.map((_, i) => {
                      const blocks = SALAZAR.filter((b) => b.day === i + 1 && b.clinic === c);
                      return (
                        <div key={i} className="flex min-h-20 flex-col gap-1 border-b border-rule p-1.5">
                          {blocks.map((b) => (
                            <div key={b.from} className={cn(s.block, b.clinic === 'Norte' && s.blockAlt, 'px-2 py-1')}>
                              <span className="block font-mono">
                                {b.from}–{b.to}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Situaciones reales y qué hace el sistema */}
        <section id="casos" className={cn(s.gutter, 'py-16')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-8">
            <div className="flex max-w-3xl flex-col gap-2">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">Lo que la doctora preguntó</p>
              <h2 className="font-display text-4xl font-extrabold">Qué pasa cuando…</h2>
            </div>
            <ul className="grid gap-x-12 gap-y-8 md:grid-cols-2">
              {CASES.map(({ Icon, when, then }) => (
                <li key={when} className="flex gap-4 border-t-2 border-ink pt-4">
                  <Icon className="mt-1 size-7 shrink-0 text-ballpoint" aria-hidden />
                  <div className="flex flex-col gap-2">
                    <h3 className="font-display text-xl font-bold">{when}</h3>
                    <p className="text-ink-2">{then}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Para doña Rosa: mensajes para personas */}
        <section className={cn(s.gutter, 'bg-ballpoint py-16 text-ballpoint-ink')}>
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-4xl font-extrabold">Escrito para doña Rosa, no para un programador</h2>
              <p className="text-lg opacity-90">
                Letra de 18 puntos que se puede agrandar, botones del tamaño de un dedo, modo oscuro para poca luz, y una frase al final de cada cita para leérsela al paciente
                por teléfono antes de confirmar.
              </p>
            </div>
            <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 text-ink">
              <p className={s.devError}>Error 23P01: conflicting key value violates exclusion constraint “appointment_doctor_no_overlap”</p>
              <p className="flex items-start gap-3 rounded-md border-2 border-redpen/40 bg-redpen-soft px-4 py-3 text-lg font-bold">
                Ese horario acaba de ser ocupado por otra cita de este médico. Elija otra hora.
              </p>
              <p className="text-sm text-ink-3">El mismo error, como lo ve la base de datos y como lo ve la recepcionista.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className={cn(s.gutter, 'py-10')}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-ink-2">
          <p className="tabular">3 clínicas · 12 médicos · 5 recepcionistas · ~400 pacientes al mes</p>
          <div className="flex gap-4">
            <a className="underline underline-offset-4" href="/api/docs">
              Documentación de la API
            </a>
            <Link className="font-bold text-ballpoint underline underline-offset-4" href="/ingresar">
              Ingresar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
