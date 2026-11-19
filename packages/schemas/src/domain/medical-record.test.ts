import { describe, expect, it } from 'vitest';
import { ConsultationCreateSchema, MedicalHistorySchema, bodyMassIndex } from './medical-record';

describe('Ficha médica', () => {
  it('conserva los renglones de los antecedentes y deja vacío como null', () => {
    const r = MedicalHistorySchema.parse({ allergies: '  Penicilina  \r\n\r\n\r\n  Mariscos ', habits: '   ', bloodType: 'O+' });
    expect(r.allergies).toBe('Penicilina\n\nMariscos');
    expect(r.habits).toBeNull();
    expect(r.medications).toBeNull();
  });

  it('acepta medidas con coma y redondea a un decimal', () => {
    const r = ConsultationCreateSchema.parse({ reason: 'Control', weightKg: '70,46', heightCm: 165, systolic: '120', diastolic: 80, temperatureC: '' });
    expect(r.weightKg).toBe(70.5);
    expect(r.systolic).toBe(120);
    expect(r.temperatureC).toBeNull();
    expect(r.appointmentId).toBeNull();
  });

  it('atrapa errores de tipeo en los signos vitales', () => {
    const r = ConsultationCreateSchema.safeParse({ reason: 'Control', weightKg: 700, temperatureC: 3.65, heartRate: 72.5 });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['weightKg', 'temperatureC', 'heartRate']));
    const inverted = ConsultationCreateSchema.safeParse({ reason: 'Control', systolic: 80, diastolic: 120 });
    expect(inverted.error!.issues.map((i) => i.path[0])).toEqual(['diastolic']);
  });

  it('pide las dos cifras de la presión y el motivo', () => {
    const r = ConsultationCreateSchema.safeParse({ reason: ' ', systolic: 120 });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['reason', 'diastolic']));
  });

  it('calcula el IMC', () => {
    expect(bodyMassIndex(70, 165)).toBe(25.7);
    expect(bodyMassIndex(70, null)).toBeNull();
  });
});
