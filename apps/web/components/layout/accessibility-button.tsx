'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Accessibility,
  BookOpenText,
  Contrast,
  Focus,
  Hand,
  Link2,
  Monitor,
  Moon,
  MousePointer2,
  MoveVertical,
  Pause,
  PauseCircle,
  Play,
  RotateCcw,
  Rows3,
  Square,
  Sun,
  Type,
  Volume2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { blockOf, pageItems, spokenName, useReadAloud } from './read-aloud';
import { A11Y_FLAGS } from './a11y-flags';

/**
 * Opciones de accesibilidad en todas las pantallas (página pública, ingreso, sistema y portal):
 * lectura en voz alta, tamaño y tipo de letra, tema, alto contraste, guía de lectura, cursor grande,
 * foco muy visible, enlaces subrayados, más espacio entre líneas y menos movimiento.
 * Se guardan en este equipo y se aplican antes de pintar (ver el script en app/layout.tsx).
 * Atajo de teclado: Alt + A abre y cierra el panel; Escape detiene la lectura.
 */
type Theme = 'system' | 'light' | 'dark';
type TextSize = 'normal' | 'grande' | 'muy-grande';
type Rate = '0.8' | '1' | '1.25';

interface Prefs {
  theme: Theme;
  text: TextSize;
  rate: Rate;
  contrast: boolean;
  motion: boolean;
  links: boolean;
  spacing: boolean;
  font: boolean;
  cursor: boolean;
  focus: boolean;
  guide: boolean;
  readTap: boolean;
}

const DEFAULTS: Prefs = {
  theme: 'system',
  text: 'normal',
  rate: '1',
  contrast: false,
  motion: false,
  links: false,
  spacing: false,
  font: false,
  cursor: false,
  focus: false,
  guide: false,
  readTap: false,
};

type Flag = keyof typeof A11Y_FLAGS;
const FLAG_ENTRIES = Object.entries(A11Y_FLAGS) as [Flag, (typeof A11Y_FLAGS)[Flag]][];

function save(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* navegador sin almacenamiento: la preferencia dura hasta recargar */
  }
}

function readRate(): Rate {
  try {
    const r = localStorage.getItem('ca-rate');
    return r === '0.8' || r === '1.25' ? r : '1';
  } catch {
    return '1';
  }
}

function read(): Prefs {
  const d = document.documentElement.dataset;
  const flags = Object.fromEntries(FLAG_ENTRIES.map(([name, f]) => [name, d[f.attr] === f.on])) as Record<Flag, boolean>;
  return { theme: d.theme === 'dark' || d.theme === 'light' ? d.theme : 'system', text: d.text === 'grande' || d.text === 'muy-grande' ? d.text : 'normal', rate: readRate(), ...flags };
}

function apply(p: Prefs) {
  const d = document.documentElement.dataset;
  if (p.theme === 'system') delete d.theme;
  else d.theme = p.theme;
  save('ca-theme', p.theme === 'system' ? null : p.theme);
  if (p.text === 'normal') delete d.text;
  else d.text = p.text;
  save('ca-text', p.text === 'normal' ? null : p.text);
  save('ca-rate', p.rate === '1' ? null : p.rate);
  for (const [name, f] of FLAG_ENTRIES) {
    if (p[name]) d[f.attr] = f.on;
    else delete d[f.attr];
    save(f.key, p[name] ? f.on : null);
  }
}

const INTERACTIVE = 'a[href],button,[role=button],[role=tab],[role=switch],[role=radio],input,select,textarea,summary';
const OWN = '#a11y-panel,#a11y-reader,#a11y-toggle';

export function AccessibilityButton() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const reader = useReadAloud(Number(prefs.rate));
  const lastSelection = useRef('');

  useEffect(() => setPrefs(read()), []);

  // Se cierra con Escape o tocando fuera, y devuelve el foco al botón.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(OWN)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  // Alt + A abre o cierra el panel; Escape detiene la lectura. Se recuerda el último texto seleccionado.
  const { stop, state: readerState } = reader;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyA') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && readerState !== 'idle') stop();
    };
    const onSelect = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (text && !sel?.anchorNode?.parentElement?.closest(OWN)) lastSelection.current = text;
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('selectionchange', onSelect);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('selectionchange', onSelect);
    };
  }, [stop, readerState]);

  // "Leer al tocar": lee el texto o el botón que se toca (sin impedir que funcione) y lo que recibe el foco con el teclado.
  const { read: speak, supported } = reader;
  useEffect(() => {
    if (!prefs.readTap || !supported) return;
    let keyboard = false;
    const onKey = (e: KeyboardEvent) => (keyboard = e.key === 'Tab' || e.key.startsWith('Arrow'));
    const onClick = (e: MouseEvent) => {
      keyboard = false;
      const target = e.target as Element;
      if (target.closest(OWN)) return;
      const control = target.closest<HTMLElement>(INTERACTIVE);
      if (control) return speak([{ text: spokenName(control) }]);
      const block = blockOf(target);
      if (block && !window.getSelection()?.toString()) speak([{ el: block, text: block.innerText }]);
    };
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (keyboard && el.matches?.(INTERACTIVE) && !el.closest(OWN)) speak([{ text: spokenName(el) }]);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('focusin', onFocus);
    };
  }, [prefs.readTap, supported, speak]);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    apply(next);
  };
  const changed = JSON.stringify(prefs) !== JSON.stringify(DEFAULTS);

  /** Lee lo seleccionado; si no hay nada, la página desde lo que se ve en pantalla. */
  const readPage = () => {
    const selected = window.getSelection()?.toString().trim() || lastSelection.current;
    lastSelection.current = '';
    if (selected) return speak([{ text: selected }]);
    const items = pageItems();
    const firstOnScreen = items.find((i) => i.el && i.el.getBoundingClientRect().bottom > 80)?.el;
    speak(window.scrollY > 200 ? pageItems(undefined, firstOnScreen) : items);
    setOpen(false);
  };

  return (
    <>
      {prefs.guide && <ReadingGuide />}
      {reader.state !== 'idle' && !open && <ReaderBar reader={reader} />}

      <button
        ref={button}
        id="a11y-toggle"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-keyshortcuts="Alt+A"
        aria-label="Opciones de accesibilidad"
        title="Opciones de accesibilidad (Alt + A)"
        className="fixed z-[60] grid size-14 place-items-center rounded-full bg-ballpoint text-ballpoint-ink shadow-lg ring-4 ring-paper hover:brightness-110"
        style={{ right: 'calc(1rem + env(safe-area-inset-right, 0px))', bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {open ? <X className="size-7" aria-hidden /> : <Accessibility className="size-7" aria-hidden />}
      </button>

      {open && (
        <div
          ref={panel}
          id="a11y-panel"
          role="dialog"
          aria-label="Opciones de accesibilidad"
          className="fixed z-[60] flex max-h-[calc(100dvh-7rem)] w-[min(25rem,calc(100vw-2rem))] flex-col gap-5 overflow-y-auto overscroll-contain rounded-lg border border-rule bg-surface p-5 text-ink shadow-xl"
          style={{ right: 'calc(1rem + env(safe-area-inset-right, 0px))', bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
          data-lenis-prevent
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Accesibilidad</h2>
            {changed && (
              <button type="button" onClick={() => update(DEFAULTS)} className="flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-bold text-ballpoint hover:bg-ballpoint-soft">
                <RotateCcw className="size-4" aria-hidden /> Restablecer
              </button>
            )}
          </div>

          <Section title="Leer en voz alta">
            {reader.supported ? (
              <>
                {reader.state === 'idle' ? (
                  <button type="button" onClick={readPage} className="flex min-h-14 items-center justify-center gap-2 rounded-md bg-ballpoint px-4 font-bold text-ballpoint-ink hover:brightness-110">
                    <Volume2 className="size-6" aria-hidden /> {lastSelection.current ? 'Leer lo seleccionado' : 'Leer esta página'}
                  </button>
                ) : (
                  <ReaderControls reader={reader} />
                )}
                <Group label="Velocidad">
                  {(
                    [
                      ['0.8', 'Lenta'],
                      ['1', 'Normal'],
                      ['1.25', 'Rápida'],
                    ] as const
                  ).map(([value, label]) => (
                    <Choice key={value} checked={prefs.rate === value} onClick={() => update({ rate: value })}>
                      {label}
                    </Choice>
                  ))}
                </Group>
                <Toggle icon={Hand} label="Leer al tocar" hint="Toque un texto o un botón y se lo leemos" checked={prefs.readTap} onChange={(v) => update({ readTap: v })} />
                <p className="text-sm text-ink-3">También puede seleccionar un texto y pulsar "Leer lo seleccionado".</p>
              </>
            ) : (
              <p className="text-ink-2">Este navegador no puede leer en voz alta. Pruebe con Chrome, Edge o Safari actualizados.</p>
            )}
          </Section>

          <Section title="Texto">
            <Group label="Tamaño de la letra">
              {(
                [
                  ['normal', 'Normal', 'text-base'],
                  ['grande', 'Grande', 'text-lg'],
                  ['muy-grande', 'Muy grande', 'text-xl'],
                ] as const
              ).map(([value, label, size]) => (
                <Choice key={value} checked={prefs.text === value} onClick={() => update({ text: value })}>
                  <span className={cn('font-bold', size)}>A</span> {label}
                </Choice>
              ))}
            </Group>
            <Toggle icon={Type} label="Letra más legible" hint="Una sola letra clara en toda la página" checked={prefs.font} onChange={(v) => update({ font: v })} />
            <Toggle icon={MoveVertical} label="Más espacio entre líneas" hint="Facilita seguir el renglón" checked={prefs.spacing} onChange={(v) => update({ spacing: v })} />
          </Section>

          <Section title="Colores">
            <Group label="Tema">
              {(
                [
                  ['light', 'Claro', Sun],
                  ['dark', 'Oscuro', Moon],
                  ['system', 'Automático', Monitor],
                ] as const
              ).map(([value, label, Icon]) => (
                <Choice key={value} checked={prefs.theme === value} onClick={() => update({ theme: value })}>
                  <Icon className="size-5" aria-hidden /> {label}
                </Choice>
              ))}
            </Group>
            <Toggle icon={Contrast} label="Alto contraste" hint="Texto y bordes más marcados" checked={prefs.contrast} onChange={(v) => update({ contrast: v })} />
          </Section>

          <Section title="Ver y moverse">
            <Toggle icon={Rows3} label="Guía de lectura" hint="Una franja que sigue al dedo o al ratón" checked={prefs.guide} onChange={(v) => update({ guide: v })} />
            <Toggle icon={MousePointer2} label="Cursor grande" hint="Flecha más grande y fácil de ubicar" checked={prefs.cursor} onChange={(v) => update({ cursor: v })} />
            <Toggle icon={Focus} label="Foco muy visible" hint="Marca amarilla al moverse con el teclado" checked={prefs.focus} onChange={(v) => update({ focus: v })} />
            <Toggle icon={Link2} label="Subrayar enlaces" hint="Para distinguirlos sin depender del color" checked={prefs.links} onChange={(v) => update({ links: v })} />
            <Toggle icon={PauseCircle} label="Menos movimiento" hint="Sin animaciones ni desplazamiento suave" checked={prefs.motion} onChange={(v) => update({ motion: v })} />
          </Section>
          <p className="text-sm text-ink-3">
            Se guarda en este equipo. Atajo: <kbd className="rounded border border-rule-strong px-1 font-mono">Alt</kbd> + <kbd className="rounded border border-rule-strong px-1 font-mono">A</kbd>
          </p>
        </div>
      )}
    </>
  );
}

type Reader = ReturnType<typeof useReadAloud>;

function ReaderControls({ reader }: { reader: Reader }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {reader.state === 'playing' ? (
        <button type="button" onClick={reader.pause} className="flex min-h-12 items-center justify-center gap-2 rounded-md border-2 border-ballpoint font-bold text-ballpoint">
          <Pause className="size-5" aria-hidden /> Pausar
        </button>
      ) : (
        <button type="button" onClick={reader.resume} className="flex min-h-12 items-center justify-center gap-2 rounded-md border-2 border-ballpoint font-bold text-ballpoint">
          <Play className="size-5" aria-hidden /> Continuar
        </button>
      )}
      <button type="button" onClick={reader.stop} className="flex min-h-12 items-center justify-center gap-2 rounded-md border-2 border-rule-strong font-bold">
        <Square className="size-5" aria-hidden /> Detener
      </button>
    </div>
  );
}

/** Mientras lee con el panel cerrado: qué está leyendo y los controles, junto al botón. */
function ReaderBar({ reader }: { reader: Reader }) {
  return (
    <div
      id="a11y-reader"
      role="region"
      aria-label="Lectura en voz alta"
      className="fixed z-[60] flex w-[min(22rem,calc(100vw-6rem))] flex-col gap-2 rounded-lg border border-rule bg-surface p-3 text-ink shadow-xl"
      style={{ right: 'calc(5.5rem + env(safe-area-inset-right, 0px))', bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <p className="flex items-center gap-2 text-sm font-bold text-ballpoint">
        <BookOpenText className="size-4" aria-hidden /> {reader.state === 'paused' ? 'Lectura en pausa' : 'Leyendo…'}
      </p>
      <p className="line-clamp-2 text-sm text-ink-2">{reader.current}</p>
      <ReaderControls reader={reader} />
    </div>
  );
}

/** Oscurece la pantalla salvo una franja alrededor del dedo o el ratón, para no perder el renglón. */
function ReadingGuide() {
  const [y, setY] = useState<number | null>(null);
  useEffect(() => {
    setY(window.innerHeight / 2);
    const move = (e: PointerEvent) => setY(e.clientY);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
    };
  }, []);
  if (y === null) return null;
  const band = 64;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[55]">
      <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: Math.max(0, y - band / 2) }} />
      <div className="absolute inset-x-0 border-y-2 border-[#ffd400]" style={{ top: y - band / 2, height: band }} />
      <div className="absolute inset-x-0 bottom-0 bg-black/55" style={{ top: y + band / 2 }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-rule pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      <p className="font-bold">{label}</p>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function Choice({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md border-2 px-1 text-sm',
        checked ? 'border-ballpoint bg-ballpoint-soft font-bold text-ballpoint' : 'border-rule-strong text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ icon: Icon, label, hint, checked, onChange }: { icon: typeof Contrast; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('flex min-h-14 items-center gap-3 rounded-md border-2 px-3 text-left', checked ? 'border-ballpoint bg-ballpoint-soft' : 'border-rule hover:border-rule-strong')}
    >
      <Icon className={cn('size-5 shrink-0', checked ? 'text-ballpoint' : 'text-ink-3')} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="font-bold">{label}</span>
        <span className="text-sm text-ink-3">{hint}</span>
      </span>
      <span className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-ballpoint' : 'bg-rule-strong')} aria-hidden>
        <span className={cn('absolute top-1 size-5 rounded-full bg-surface transition-[left]', checked ? 'left-6' : 'left-1')} />
      </span>
    </button>
  );
}
