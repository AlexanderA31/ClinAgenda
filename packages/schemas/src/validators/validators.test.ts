import { describe, expect, it } from 'vitest';
import { checkCedula, isValidCedula } from './cedula';
import { checkPhone } from './phone';
import { cleanText, normalizeForSearch, toTitleCaseName } from './text';
import { ageOn, isRealIsoDate } from './dates';

describe('cédula ecuatoriana', () => {
  it.each(['1712345675', '0923456784', '0102030400', '171234567-5', ' 1712345675 '])('acepta %s', (c) => {
    expect(isValidCedula(c)).toBe(true);
  });

  it('rechaza 0000000000 por provincia inexistente', () => expect(checkCedula('0000000000')).toBe('PROVINCIA'));
  it('rechaza 9 dígitos', () => expect(checkCedula('171234567')).toBe('LONGITUD'));
  it('rechaza letras', () => expect(checkCedula('17123456A5')).toBe('NO_NUMERICA'));
  it('rechaza un dígito mal copiado', () => expect(checkCedula('1712345676')).toBe('VERIFICADOR'));
  it('rechaza provincia 25', () => expect(checkCedula('2512345678')).toBe('PROVINCIA'));
  it('rechaza tercer dígito 6 (no es persona natural)', () => expect(checkCedula('1762345678')).toBe('TERCER_DIGITO'));
  it('rechaza 1111111111', () => expect(isValidCedula('1111111111')).toBe(false));
});

describe('teléfonos', () => {
  it('normaliza un celular dictado con espacios', () => {
    const r = checkPhone('099 123 4567');
    expect(r).toMatchObject({ ok: true, e164: '+593991234567', type: 'MOVIL' });
  });
  it('acepta formato internacional', () => {
    expect(checkPhone('+593 99 123 4567')).toMatchObject({ ok: true, e164: '+593991234567' });
  });
  it('acepta fijo de Quito', () => {
    expect(checkPhone('02 245 6789')).toMatchObject({ ok: true, type: 'FIJO' });
  });
  it('rechaza 12345 diciendo que está incompleto', () => {
    const r = checkPhone('12345');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/incompleto/);
  });
  it('rechaza celular con un dígito de menos', () => {
    const r = checkPhone('099123456');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/09/);
  });
});

describe('nombres', () => {
  it('"  MARÍA   lópez " y "Maria Lopez" tienen la misma clave de búsqueda', () => {
    expect(normalizeForSearch('  MARÍA   lópez ')).toBe(normalizeForSearch('Maria Lopez'));
  });
  it('formatea en tipo título respetando partículas', () => {
    expect(toTitleCaseName('  mARÍA   DE LOS ángeles ')).toBe('María de los Ángeles');
  });
  it('quita emojis y caracteres invisibles', () => {
    expect(cleanText('Juan 😀\u200B Pérez')).toBe('Juan Pérez');
  });
});

describe('fechas', () => {
  it('detecta fechas imposibles', () => {
    expect(isRealIsoDate('2024-02-30')).toBe(false);
    expect(isRealIsoDate('2024-02-29')).toBe(true);
  });
  it('calcula edad cumplida', () => {
    expect(ageOn('2000-11-19', '2026-11-18')).toBe(25);
    expect(ageOn('2000-11-18', '2026-11-18')).toBe(26);
  });
});
