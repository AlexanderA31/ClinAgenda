/**
 * Ficha médica: quién la ve, quién escribe y qué queda en la bitácora.
 * Escribe en pacientes del Dr. Salazar del seed; se puede correr varias veces (cada corrida agrega consultas).
 *   cd apps/api && npx prisma migrate deploy && npm run seed && npm run test:e2e
 */
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppointmentView, AuditEntryView, ConsultationView, MedicalRecordView, Paginated, PatientView } from '@clinagenda/schemas';
import { AppModule } from '../src/app.module';

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo2026!';

let app: INestApplication;
let http: ReturnType<typeof request>;
let paredes: string;
let salazar: string;
let rosa: string;
/** Cita pasada del Dr. Salazar, todavía sin consulta registrada. */
let appt: AppointmentView;
let otherPatientId: string;
let consultation: ConsultationView;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const record = (patientId: string) => `/api/patients/${patientId}/medical-record`;

async function login(username: string) {
  const res = await http.post('/api/auth/login').send({ username, password: PASSWORD }).expect(200);
  return res.body.accessToken as string;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.init();
  http = request(app.getHttpServer());
  [paredes, salazar, rosa] = [await login('paredes'), await login('salazar'), await login('rosa')];

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const past: Paginated<AppointmentView> = (await http.get('/api/appointments').query({ to: yesterday, status: 'ATTENDED', pageSize: 500, sortDir: 'desc' }).set(bearer(salazar)).expect(200)).body;
  const linked = new Set<string>();
  for (const patientId of new Set(past.items.map((a) => a.patient.id))) {
    const r: MedicalRecordView = (await http.get(record(patientId)).set(bearer(salazar)).expect(200)).body;
    r.consultations.forEach((c) => c.appointment && linked.add(c.appointment.id));
    const free = past.items.find((a) => a.patient.id === patientId && !linked.has(a.id));
    if (free) {
      appt = free;
      break;
    }
  }
  expect(appt, 'El seed debe tener citas atendidas del Dr. Salazar').toBeTruthy();

  const all: Paginated<PatientView> = (await http.get('/api/patients').query({ pageSize: 100 }).set(bearer(paredes)).expect(200)).body;
  const mine: Paginated<PatientView> = (await http.get('/api/patients').query({ pageSize: 100 }).set(bearer(salazar)).expect(200)).body;
  const mineIds = new Set(mine.items.map((p) => p.id));
  otherPatientId = all.items.find((p) => !mineIds.has(p.id))!.id;
});

afterAll(async () => {
  await app?.close();
});

describe('Quién ve la ficha médica', () => {
  it('recepción no la ve', async () => {
    const res = await http.get(record(appt.patient.id)).set(bearer(rosa)).expect(403);
    expect(res.body.message).toMatch(/médicos y la dirección/);
  });

  it('un médico ve la de sus pacientes y puede escribir consultas', async () => {
    const r: MedicalRecordView = (await http.get(record(appt.patient.id)).set(bearer(salazar)).expect(200)).body;
    expect(r.canEditHistory).toBe(true);
    expect(r.canWriteConsultation).toBe(true);
  });

  it('un médico no ve la de pacientes que nunca atendió', async () => {
    await http.get(record(otherPatientId)).set(bearer(salazar)).expect(403);
  });
});

describe('Antecedentes', () => {
  it('se guardan con sus renglones y la bitácora no copia el contenido clínico', async () => {
    const allergies = `Penicilina (urticaria)\nMariscos ${Date.now()}`;
    const r: MedicalRecordView = (await http.put(record(appt.patient.id)).set(bearer(salazar)).send({ bloodType: 'O+', allergies, medications: 'Losartán 50 mg cada mañana' }).expect(200)).body;
    expect(r.history.allergies).toBe(allergies);
    expect(r.history.bloodType).toBe('O+');
    expect(r.history.updatedBy).toBe('Ernesto Salazar');

    const audit: Paginated<AuditEntryView> = (await http.get('/api/audit').query({ entity: 'MedicalRecord', entityId: appt.patient.id }).set(bearer(paredes)).expect(200)).body;
    expect(JSON.stringify(audit.items[0])).not.toContain('Penicilina');
    expect(JSON.stringify(audit.items[0])).toContain('allergies');
  });

  it('rechaza un grupo sanguíneo inventado', async () => {
    await http.put(record(appt.patient.id)).set(bearer(salazar)).send({ bloodType: 'C+' }).expect(400);
  });

  it('recepción no puede escribir', async () => {
    await http.put(record(appt.patient.id)).set(bearer(rosa)).send({ allergies: 'x' }).expect(403);
  });
});

describe('Consultas', () => {
  const consultations = () => `/api/patients/${appt.patient.id}/consultations`;

  it('se registra con signos vitales y queda ligada a la cita', async () => {
    const res = await http
      .post(consultations())
      .set(bearer(salazar))
      .send({
        appointmentId: appt.id,
        reason: 'Control de presión',
        weightKg: '70,5',
        heightCm: 165,
        systolic: 130,
        diastolic: 85,
        heartRate: 72,
        findings: 'Estable.\nSin edemas.',
        diagnosis: 'Hipertensión controlada',
        plan: 'Continuar losartán',
      })
      .expect(201);
    consultation = res.body;
    expect(consultation.appointment?.id).toBe(appt.id);
    expect(consultation.bmi).toBe(25.9);
    expect(consultation.findings).toBe('Estable.\nSin edemas.');
    expect(consultation.editable).toBe(true);
  });

  it('una cita no tiene dos consultas', async () => {
    await http.post(consultations()).set(bearer(salazar)).send({ appointmentId: appt.id, reason: 'Otra vez' }).expect(409);
  });

  it('atrapa signos vitales imposibles', async () => {
    const res = await http.post(consultations()).set(bearer(salazar)).send({ reason: 'Control', weightKg: 700, systolic: 80, diastolic: 120 }).expect(400);
    expect(res.body.fields).toHaveProperty('weightKg');
  });

  it('la dirección la ve, pero solo su autor la corrige', async () => {
    const r: MedicalRecordView = (await http.get(record(appt.patient.id)).set(bearer(paredes)).expect(200)).body;
    const seen = r.consultations.find((c) => c.id === consultation.id)!;
    expect(seen.editable).toBe(false);
    const audit: Paginated<AuditEntryView> = (await http.get('/api/audit').query({ entity: 'MedicalRecord', entityId: appt.patient.id }).set(bearer(paredes)).expect(200)).body;
    expect(audit.items[0]).toMatchObject({ action: 'VIEW_CLINICAL' });
    await http.put(`${consultations()}/${consultation.id}`).set(bearer(paredes)).send({ reason: 'Cambio ajeno' }).expect(403);

    const fixed: ConsultationView = (
      await http
        .put(`${consultations()}/${consultation.id}`)
        .set(bearer(salazar))
        .send({ ...consultation, diagnosis: 'Hipertensión arterial controlada' })
        .expect(200)
    ).body;
    expect(fixed.diagnosis).toBe('Hipertensión arterial controlada');
  });

  it('no se liga a la cita de otro paciente', async () => {
    await http.post(`/api/patients/${otherPatientId}/consultations`).set(bearer(paredes)).send({ appointmentId: appt.id, reason: 'Control' }).expect(400);
  });
});
