'use client';

import { useEffect, useState } from 'react';
import { ALargeSmall, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'system' | 'light' | 'dark';

function save(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* navegador sin almacenamiento: la preferencia dura hasta recargar */
  }
}

/** Letra más grande y tema claro/oscuro: para leer con poca luz o sin lentes. */
export function Preferences({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [big, setBig] = useState(false);

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === 'dark' || t === 'light' ? t : 'system');
    setBig(document.documentElement.dataset.text === 'grande');
  }, []);

  const applyTheme = (t: Theme) => {
    setTheme(t);
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    save('ca-theme', t === 'system' ? null : t);
  };
  const toggleBig = () => {
    const next = !big;
    setBig(next);
    if (next) document.documentElement.dataset.text = 'grande';
    else delete document.documentElement.dataset.text;
    save('ca-text', next ? 'grande' : null);
  };

  const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', Icon: Sun },
    { value: 'dark', label: 'Oscuro', Icon: Moon },
    { value: 'system', label: 'Automático', Icon: Monitor },
  ];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={toggleBig}
        aria-pressed={big}
        className={cn('flex min-h-10 items-center gap-1.5 rounded-md border-2 px-2.5 text-sm font-bold', big ? 'border-ballpoint bg-ballpoint-soft text-ballpoint' : 'border-rule-strong text-ink-2')}
      >
        <ALargeSmall className="size-5" aria-hidden /> Letra grande
      </button>
      <div role="radiogroup" aria-label="Tema de colores" className="flex rounded-md border-2 border-rule-strong">
        {options.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            title={label}
            onClick={() => applyTheme(value)}
            className={cn('flex size-10 items-center justify-center', theme === value ? 'bg-ballpoint-soft text-ballpoint' : 'text-ink-3 hover:text-ink')}
          >
            <Icon className="size-5" aria-hidden />
            <span className="sr-only">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
