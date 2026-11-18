/**
 * Validación de cédula ecuatoriana de persona natural.
 *
 * Una cédula "real" no solo tiene 10 dígitos: los dos primeros son la provincia (01–24, o 30 para
 * ecuatorianos registrados en el exterior), el tercero es menor a 6 y el último es un dígito
 * verificador calculado con el algoritmo módulo 10. Así se rechazan "0000000000", "123456789"
 * o una cédula con un dígito mal copiado.
 *
 * Limitación honesta: esto prueba que el número es *válido*, no que exista ni que sea de esa
 * persona. Para eso haría falta consultar al Registro Civil (fuera de alcance, ver DECISIONES).
 */

export type CedulaError = 'LONGITUD' | 'NO_NUMERICA' | 'PROVINCIA' | 'TERCER_DIGITO' | 'VERIFICADOR';

export const CEDULA_ERROR_MESSAGES: Record<CedulaError, string> = {
  LONGITUD: 'La cédula debe tener exactamente 10 números.',
  NO_NUMERICA: 'La cédula solo puede tener números, sin letras, guiones ni espacios.',
  PROVINCIA: 'Los dos primeros números de la cédula no corresponden a ninguna provincia. Revise que esté bien copiada.',
  TERCER_DIGITO: 'El tercer número de la cédula no es válido para una persona. Revise que esté bien copiada.',
  VERIFICADOR: 'Este número no es una cédula válida: probablemente hay un número mal escrito. Revísela con el documento en la mano.',
};

/** Quita espacios y guiones comunes al dictar o copiar ("171234567-8"). */
export function normalizeCedula(raw: string): string {
  return raw.replace(/[\s.-]/g, '');
}

export function checkCedula(raw: string): CedulaError | null {
  const cedula = normalizeCedula(raw);
  if (!/^\d+$/.test(cedula)) return 'NO_NUMERICA';
  if (cedula.length !== 10) return 'LONGITUD';

  const province = Number(cedula.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return 'PROVINCIA';

  if (Number(cedula[2]) >= 6) return 'TERCER_DIGITO';

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const sum = coefficients.reduce((acc, coef, i) => {
    const product = Number(cedula[i]) * coef;
    return acc + (product > 9 ? product - 9 : product);
  }, 0);
  const expected = (10 - (sum % 10)) % 10;
  if (expected !== Number(cedula[9])) return 'VERIFICADOR';

  return null;
}

export function isValidCedula(raw: string): boolean {
  return checkCedula(raw) === null;
}
