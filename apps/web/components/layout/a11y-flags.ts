/** Atributo en <html>, clave en localStorage y valor cuando está activo. El script de app/layout.tsx usa la misma lista. */
export const A11Y_FLAGS = {
  contrast: { attr: 'contrast', key: 'ca-contrast', on: 'alto' },
  motion: { attr: 'motion', key: 'ca-motion', on: 'reducido' },
  links: { attr: 'links', key: 'ca-links', on: 'subrayados' },
  spacing: { attr: 'spacing', key: 'ca-spacing', on: 'amplio' },
  font: { attr: 'font', key: 'ca-font', on: 'legible' },
  cursor: { attr: 'cursor', key: 'ca-cursor', on: 'grande' },
  focus: { attr: 'focus', key: 'ca-focus', on: 'fuerte' },
  guide: { attr: 'guide', key: 'ca-guide', on: 'si' },
  readTap: { attr: 'read', key: 'ca-read', on: 'tocar' },
} as const;
