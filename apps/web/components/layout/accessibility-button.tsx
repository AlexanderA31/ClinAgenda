'use client';

import { useEffect, useRef, useState } from 'react';
import { Accessibility, Contrast, Link2, Monitor, Moon, MoveVertical, PauseCircle, RotateCcw, Sun, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Opciones de accesibilidad en todas las pantallas (página pública, ingreso, sistema y portal):
 * tamaño de letra, tema, alto contraste, menos movimiento, enlaces subrayados y más espacio entre líneas.
 * Se guardan en este equipo y se aplican antes de pintar (ver el script en app/layout.tsx).
 */
type Theme = 'system' | 'light' | 'dark';
type TextSize = 'normal' | 'grande' | 'muy-grande';

interface Prefs {
  theme: Theme;
  text: TextSize;
  contrast: boolean;
  motion: boolean;
  links: boolean;
  spacing: boolean;
}

const DEFAULTS: Prefs = { theme: 'system', text: 'normal', contrast: false, motion: false, links: false, spacing: false };

/** Atributo en <html>, clave en localStorage y valor cuando está activo. */
const FLAGS = {
  contrast: { attr: 'contrast', key: 'ca-contrast', on: 'alto' },
  motion: { attr: 'motion', key: 'ca-motion', on: 'reducido' },
  links: { attr: 'links', key: 'ca-links', on: 'subrayados' },
  spacing: { attr: 'spacing', key: 'ca-spacing', on: 'amplio' },
} as const;

function save(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* navegador sin almacenamiento: la preferencia dura hasta recargar */
  }
}

function read(): Prefs {
  const d = document.documentElement.dataset;
  return {
    theme: d.theme === 'dark' || d.theme === 'light' ? d.theme : 'system',
    text: d.text === 'grande' || d.text === 'muy-grande' ? d.text : 'normal',
    contrast: d.contrast === FLAGS.contrast.on,
    motion: d.motion === FLAGS.motion.on,
    links: d.links === FLAGS.links.on,
    spacing: d.spacing === FLAGS.spacing.on,
  };
}

function apply(p: Prefs) {
  const d = document.documentElement.dataset;
  if (p.theme === 'system') delete d.theme;
  else d.theme = p.theme;
  save('ca-theme', p.theme === 'system' ? null : p.theme);
  if (p.text === 'normal') delete d.text;
  else d.text = p.text;
  save('ca-text', p.text === 'normal' ? null : p.text);
  for (const [name, f] of Object.entries(FLAGS) as [keyof typeof FLAGS, (typeof FLAGS)[keyof typeof FLAGS]][]) {
    if (p[name]) d[f.attr] = f.on;
    else delete d[f.attr];
    save(f.key, p[name] ? f.on : null);
  }
}

export function AccessibilityButton() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

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
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    apply(next);
  };
  const changed = JSON.stringify(prefs) !== JSON.stringify(DEFAULTS);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label="Opciones de accesibilidad"
        title="Opciones de accesibilidad"
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
          className="fixed z-[60] flex max-h-[calc(100dvh-7rem)] w-[min(24rem,calc(100vw-2rem))] flex-col gap-5 overflow-y-auto rounded-lg border border-rule bg-surface p-5 text-ink shadow-xl"
          style={{ right: 'calc(1rem + env(safe-area-inset-right, 0px))', bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Accesibilidad</h2>
            {changed && (
              <button type="button" onClick={() => update(DEFAULTS)} className="flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-bold text-ballpoint hover:bg-ballpoint-soft">
                <RotateCcw className="size-4" aria-hidden /> Restablecer
              </button>
            )}
          </div>

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

          <Group label="Colores">
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

          <div className="flex flex-col gap-2">
            <Toggle icon={Contrast} label="Alto contraste" hint="Texto y bordes más oscuros" checked={prefs.contrast} onChange={(v) => update({ contrast: v })} />
            <Toggle icon={PauseCircle} label="Menos movimiento" hint="Sin animaciones" checked={prefs.motion} onChange={(v) => update({ motion: v })} />
            <Toggle icon={Link2} label="Subrayar enlaces" hint="Para distinguirlos sin depender del color" checked={prefs.links} onChange={(v) => update({ links: v })} />
            <Toggle icon={MoveVertical} label="Más espacio entre líneas" hint="Facilita seguir el renglón" checked={prefs.spacing} onChange={(v) => update({ spacing: v })} />
          </div>
          <p className="text-sm text-ink-3">Se guarda en este equipo.</p>
        </div>
      )}
    </>
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
