import { describe, expect, it } from 'vitest';
import { PatientRegisterSchema } from './portal';
import { ClinicUpdateSchema } from './clinic';

const base = { documentType: 'CEDULA', documentNumber: '1710034065', firstNames: 'ana maría', lastNames: 'PÉREZ', birthDate: '1980-05-10', phone: '099 123 4567', password: 'Clave2026', acceptPrivacy: true };

describe('Registro del paciente en línea', () => {
  it('limpia nombres, documento y celular', () => {
    const r = PatientRegisterSchema.parse({ ...base, documentNumber: '171003406-5' });
    expect(r.firstNames).toBe('Ana María');
    expect(r.documentNumber).toBe('1710034065');
    expect(r.phone).toBe('+593991234567');
  });

  it('rechaza una cédula con dígito verificador incorrecto', () => {
    const r = PatientRegisterSchema.safeParse({ ...base, documentNumber: '1710034066' });
    expect(r.success).toBe(false);
  });

  it('exige ser mayor de edad, celular y aceptar el aviso de privacidad', () => {
    const r = PatientRegisterSchema.safeParse({ ...base, birthDate: '2015-01-01', phone: '', acceptPrivacy: false });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['birthDate', 'phone', 'acceptPrivacy']));
  });

  it('acepta pasaporte con letras', () => {
    expect(PatientRegisterSchema.safeParse({ ...base, documentType: 'PASAPORTE', documentNumber: 'ab 123456' }).success).toBe(true);
  });
});

describe('Editar horario de una clínica', () => {
  it('rechaza horarios que se cruzan el mismo día', () => {
    const r = ClinicUpdateSchema.safeParse({ schedule: [{ weekday: 1, startTime: '08:00', endTime: '12:00' }, { weekday: 1, startTime: '11:00', endTime: '13:00' }] });
    expect(r.success).toBe(false);
  });

  it('acepta mañana y tarde con corte para almorzar', () => {
    const r = ClinicUpdateSchema.safeParse({ schedule: [{ weekday: 1, startTime: '08:00', endTime: '12:00' }, { weekday: 1, startTime: '14:00', endTime: '18:00' }] });
    expect(r.success).toBe(true);
  });
});
