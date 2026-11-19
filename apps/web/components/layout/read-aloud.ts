'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lectura en voz alta con la voz del propio navegador (Web Speech API): no envía el texto a ningún
 * servicio externo, funciona sin internet en la mayoría de equipos y no cuesta nada.
 * Lee la página bloque por bloque (titulares, párrafos, listas, tablas), resalta y lleva a la vista
 * lo que está leyendo, y se puede pausar, continuar o detener.
 */
export type ReaderState = 'idle' | 'playing' | 'paused';

/** Bloques que se leen como una unidad. Si uno está dentro de otro, se lee el de afuera completo. */
const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,th,td,legend,label,summary,address,[data-read]';
/** Lo que nunca se lee: el propio panel, lo oculto a lectores de pantalla y lo decorativo. */
const SKIP = '#a11y-panel,#a11y-reader,[aria-hidden="true"],[hidden],script,style,noscript,svg';
const HIGHLIGHT = 'a11yReading';
/** Chrome corta frases muy largas a los ~15 s: se parten en trozos de oraciones. */
const CHUNK = 220;

interface Item {
  text: string;
  el?: HTMLElement;
}

const clean = (t: string) => t.replace(/\s+/g, ' ').trim();

function visible(el: HTMLElement) {
  if (el.closest(SKIP)) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && el.getClientRects().length > 0;
}

/** Los bloques legibles de la página, en orden, empezando por el contenido principal. */
export function pageItems(root: HTMLElement = document.querySelector('main') ?? document.body, from?: HTMLElement | null): Item[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS)).filter((el) => !el.parentElement?.closest(BLOCKS) && visible(el));
  const start = from ? all.findIndex((el) => el === from || el.contains(from) || from.contains(el)) : -1;
  return all
    .slice(Math.max(0, start))
    .map((el) => ({ el, text: clean(el.innerText) }))
    .filter((i) => i.text.length > 0);
}

/** Lo que diría un lector de pantalla de un botón o enlace: su etiqueta accesible o su texto. */
export function spokenName(el: HTMLElement): string {
  const label = el.getAttribute('aria-label') ?? (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby')!)?.innerText);
  const text = clean(label || el.innerText || (el as HTMLInputElement).value || el.getAttribute('title') || '');
  const role = el.matches('a[href]') ? 'Enlace' : el.matches('button,[role=button]') ? 'Botón' : el.matches('input,select,textarea') ? 'Campo' : '';
  if (role === 'Campo') {
    const id = el.id && document.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`);
    return clean(`${role}: ${id ? id.innerText : (el.getAttribute('placeholder') ?? '')}. ${text}`);
  }
  return role && text ? `${role}: ${text}` : text;
}

/** Bloque legible que contiene al elemento tocado. */
export function blockOf(target: Element): HTMLElement | null {
  const el = target.closest<HTMLElement>(BLOCKS);
  if (!el || !visible(el)) return null;
  return el.parentElement?.closest<HTMLElement>(BLOCKS) ?? el;
}

function chunks(text: string): string[] {
  const out: string[] = [];
  let current = '';
  for (const sentence of text.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [text]) {
    if ((current + sentence).length > CHUNK && current) {
      out.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** La mejor voz en español disponible: primero la de Ecuador, luego Latinoamérica, luego cualquiera. */
function spanishVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
  const rank = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.toLowerCase();
    return (lang === 'es-ec' ? 0 : lang === 'es-419' || lang === 'es-us' || lang === 'es-mx' || lang === 'es-co' ? 1 : lang === 'es-es' ? 3 : 2) - (v.localService ? 0.5 : 0);
  };
  return voices.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function useReadAloud(rate: number) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<ReaderState>('idle');
  const [current, setCurrent] = useState('');
  const queue = useRef<Item[]>([]);
  const run = useRef(0);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    setSupported(true);
    // Las voces cargan después: pedirlas temprano hace que estén listas al primer uso.
    window.speechSynthesis.getVoices();
    const stopOnLeave = () => window.speechSynthesis.cancel();
    window.addEventListener('pagehide', stopOnLeave);
    return () => {
      window.removeEventListener('pagehide', stopOnLeave);
      window.speechSynthesis.cancel();
    };
  }, []);

  const unmark = () => document.querySelectorAll<HTMLElement>('[data-a11y-reading]').forEach((el) => delete el.dataset[HIGHLIGHT]);

  const next = useCallback((id: number) => {
    if (id !== run.current) return;
    unmark();
    const item = queue.current.shift();
    if (!item) {
      setState('idle');
      setCurrent('');
      return;
    }
    if (item.el?.isConnected) {
      item.el.dataset[HIGHLIGHT] = '';
      const calm = document.documentElement.dataset.motion === 'reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      item.el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    }
    const text = clean(item.text);
    setCurrent(text);
    const parts = chunks(text);
    const voice = spanishVoice();
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = voice?.lang ?? 'es-EC';
      if (voice) u.voice = voice;
      u.rate = rateRef.current;
      if (i === parts.length - 1) {
        u.onend = () => next(id);
        u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? undefined : next(id));
      }
      window.speechSynthesis.speak(u);
    });
  }, []);

  const read = useCallback(
    (items: Item[]) => {
      if (!supported || !items.length) return;
      window.speechSynthesis.cancel();
      run.current += 1;
      queue.current = [...items];
      setState('playing');
      next(run.current);
    },
    [supported, next],
  );

  const stop = useCallback(() => {
    run.current += 1;
    queue.current = [];
    window.speechSynthesis?.cancel();
    unmark();
    setState('idle');
    setCurrent('');
  }, []);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setState('playing');
  }, []);

  return { supported, state, current, read, stop, pause, resume };
}
