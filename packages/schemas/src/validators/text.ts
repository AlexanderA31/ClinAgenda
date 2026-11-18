/**
 * Limpieza de texto libre que llega desde formularios o archivos importados.
 * Objetivo: que "  MARÍA   lópez " y "Maria Lopez" se reconozcan como el mismo nombre,
 * y que emojis, caracteres de control o código pegado por error no lleguen a la base.
 */

// Caracteres de control (excepto salto de línea y tabulador) y caracteres invisibles de ancho cero.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g;
// Emojis y pictogramas.
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/gu;
// Letras de cualquier alfabeto latino con tildes, espacios, apóstrofe, guion y punto (p. ej. "D'Alessandro", "Ma. José").
export const PERSON_NAME_PATTERN = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

/** Quita caracteres de control, emojis y espacios repetidos. No cambia mayúsculas. */
export function cleanText(value: string): string {
  return value.normalize('NFC').replace(CONTROL_CHARS, '').replace(EMOJI, '').replace(/\s+/g, ' ').trim();
}

/** "  mARÍA   lÓPEZ " -> "María López". Respeta partículas comunes en minúscula ("de", "del", "la"). */
export function toTitleCaseName(value: string): string {
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'van', 'von']);
  return cleanText(value)
    .toLocaleLowerCase('es')
    .split(' ')
    .map((word, i) => {
      if (i > 0 && particles.has(word)) return word;
      return word
        .split('-')
        .map((part) => part.charAt(0).toLocaleUpperCase('es') + part.slice(1))
        .join('-');
    })
    .join(' ');
}

/** Clave de comparación: sin tildes, minúsculas, un solo espacio. "MARÍA  López" -> "maria lopez". */
export function normalizeForSearch(value: string): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9ñ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
