import { describe, expect, it } from 'vitest';
import { PatientCreateSchema } from './patient';

const base = {
  firstNames: '  MARÍA  josé ',
  lastNames: 'lópez',
  birthDate: '1980-05-10',
  documentType: 'CEDULA' as const,
  documentNumber: '1712345675',
  phone: '0991234567',
};

function issues(input: unknown) {
  const r = PatientCreateSchema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('PatientCreateSchema', () => {
  it('limpia y normaliza un paciente válido', () => {
    const r = PatientCreateSchema.parse(base);
    expect(r.firstNames).toBe('María José');
    expect(r.lastNames).toBe('López');
    expect(r.phone).toBe('+593991234567');
  });

  it('rechaza año 2090', () => expect(issues({ ...base, birthDate: '2090-01-01' })).toHaveProperty('birthDate'));
  it('rechaza 300 años de edad', () => expect(issues({ ...base, birthDate: '1726-01-01' })).toHaveProperty('birthDate'));
  it('rechaza correo con doble @', () => expect(issues({ ...base, email: 'juan@@gmail' })).toHaveProperty('email'));
  it('rechaza nombre con números o código', () => expect(issues({ ...base, firstNames: '<script>alert(1)</script>' })).toHaveProperty('firstNames'));

  it('acepta pasaporte extranjero', () => {
    expect(PatientCreateSchema.safeParse({ ...base, documentType: 'PASAPORTE', documentNumber: 'ab 123456' }).success).toBe(true);
  });

  it('exige motivo cuando no hay documento', () => {
    expect(issues({ ...base, documentType: 'SIN_DOCUMENTO', documentNumber: null })).toHaveProperty('noDocumentReason');
  });

  it('exige representante para menores', () => {
    expect(issues({ ...base, birthDate: '2020-01-01' })).toHaveProperty('guardian');
  });

  it('acepta paciente sin teléfono ni correo si hay nota de contacto', () => {
    const r = PatientCreateSchema.safeParse({
      ...base,
      phone: null,
      documentType: 'SIN_DOCUMENTO',
      documentNumber: null,
      noDocumentReason: 'Adulto mayor, perdió la cédula',
      contactNote: 'Avisar a su hija Carmen en la tienda frente a la clínica',
    });
    expect(r.success).toBe(true);
  });

  it('pide forma de contacto cuando no hay ninguna', () => {
    expect(issues({ ...base, phone: null })).toHaveProperty('contactNote');
  });
});
