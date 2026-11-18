import { parse } from 'csv-parse/sync';
import { normalizeForSearch } from '@clinagenda/schemas';

/** Lee un CSV tal como lo exportaría Excel en una clínica: con ; o , como separador, con o sin BOM, en UTF-8 o Latin-1. */
export function readCsv(buffer: Buffer): Record<string, string>[] {
  let text = buffer.toString('utf8');
  if (text.includes('\uFFFD')) text = buffer.toString('latin1');
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  return parse(text, {
    columns: (header: string[]) => header.map((h) => normalizeForSearch(h).replace(/ /g, '_')),
    delimiter,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[];
}

/** Toma el primer valor no vacío entre varios nombres de columna posibles. */
export function pick(row: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = row[a];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/** Acepta 2026-03-05, 05/03/2026, 5-3-2026. Rechaza años de 2 dígitos (¿1926 o 2026?). */
export function parseFlexibleDate(raw: string): { value: string | null; fixed: boolean } {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return { value: v.slice(0, 10), fixed: false };
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) {
    const [, d, mo, y] = m;
    return { value: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, fixed: true };
  }
  return { value: null, fixed: false };
}

/** "9:5", "09:05", "9h05", "14.30" -> "HH:MM". */
export function parseFlexibleTime(raw: string): string | null {
  const m = /^(\d{1,2})[:h.](\d{2})/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
