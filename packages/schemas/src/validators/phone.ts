import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * Teléfonos: se aceptan como los dicta la gente ("099 123 4567", "0991234567", "+593 99 123 4567",
 * "02 245 6789") y se guardan en formato internacional E.164 (+593991234567) para que el mismo
 * número escrito de dos formas no parezca dos números distintos.
 * "12345" o un celular con un dígito de menos se rechazan con un mensaje que dice qué falta.
 */

export type PhoneCheck =
  | { ok: true; e164: string; national: string; type: 'MOVIL' | 'FIJO' | 'OTRO' }
  | { ok: false; message: string };

export function checkPhone(raw: string, defaultCountry: 'EC' = 'EC'): PhoneCheck {
  const value = raw.trim();
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) {
    return { ok: false, message: 'Escriba el teléfono solo con números, por ejemplo 0991234567.' };
  }
  if (digits.length < 7) {
    return { ok: false, message: `El teléfono tiene solo ${digits.length} números; está incompleto. Un celular tiene 10 (ej. 0991234567).` };
  }

  const parsed = parsePhoneNumberFromString(value, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    const looksLikeMobile = digits.startsWith('09') || digits.startsWith('5939');
    const hint = looksLikeMobile
      ? 'Un celular de Ecuador tiene 10 números y empieza con 09 (ej. 0991234567).'
      : 'Un teléfono fijo lleva el código de provincia (ej. 022456789). Si es extranjero, empiece con + y el código del país.';
    return { ok: false, message: `Este teléfono no parece válido. ${hint}` };
  }

  const kind = parsed.getType();
  return {
    ok: true,
    e164: parsed.number,
    national: parsed.formatNational(),
    type: kind === 'MOBILE' ? 'MOVIL' : kind === 'FIXED_LINE' ? 'FIJO' : 'OTRO',
  };
}

/** Para mostrar: +593991234567 -> "099 123 4567". */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatNational() : e164;
}
