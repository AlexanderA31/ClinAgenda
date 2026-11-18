/**
 * Pruebas de punta a punta contra una base PostgreSQL real con migraciones y datos de demostración.
 *   cd apps/api && npx prisma migrate deploy && npm run seed && npm run test:e2e
 * Cubren las preguntas más delicadas de la clienta: choques simultáneos, médico en dos clínicas,
 * fechas pasadas, doble cancelación, deshacer, privacidad de notas clínicas y bitácora.
 */
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AvailabilitySlot, ClinicView, DoctorView, Paginated, PatientView } from '@clinagenda/schemas';
import { AppModule } from '../src/app.module';

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo2026!';

let app: INestApplication;
let http: ReturnType<typeof request>;
const tokens: Record<string, string> = {};

const as = (user: string) => ({ Authorization: `Bearer ${tokens[user]}` });

async function login(username: string) {
  const res = await http.post('/api/auth/login').send({ username, password: PASSWORD }).expect(200);
  tokens[username] = res.body.accessToken;
}

let centro: ClinicView;
let norte: ClinicView;
let salazar: DoctorView;
let patients: PatientView[];

/** Busca el próximo horario libre del Dr. Salazar en Centro. */
async function nextFreeSlots(): Promise<AvailabilitySlot[]> {
  for (let i = 1; i < 40; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    const res = await http.get('/api/appointments/availability').query({ clinicId: centro.id, date, doctorId: salazar.id }).set(as('rosa')).expect(200);
    const free = (res.body.slots as AvailabilitySlot[]).filter((s) => s.available);
    if (free.length >= 3) return free;
  }
  throw new Error('No hay horarios libres para probar');
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.init();
  http = request(app.getHttpServer());
  await Promise.all(['rosa', 'lucia', 'salazar', 'paredes'].map(login));

  const clinics: ClinicView[] = (await http.get('/api/clinics').set(as('rosa'))).body;
  centro = clinics.find((c) => c.name === 'Clínica Centro')!;
  norte = clinics.find((c) => c.name === 'Clínica Norte')!;
  const doctors: DoctorView[] = (await http.get('/api/doctors').set(as('rosa'))).body;
  salazar = doctors.find((d) => d.fullName === 'Ernesto Salazar')!;
  const page: Paginated<PatientView> = (await http.get('/api/patients').query({ pageSize: 10 }).set(as('rosa'))).body;
  patients = page.items.filter((p) => p.age >= 18);
});

afterAll(async () => {
  await app?.close();
});

describe('Agendamiento', () => {
  it('dos recepcionistas, mismo médico y hora, al mismo tiempo: una sola cita y un mensaje claro', async () => {
    const [slot] = await nextFreeSlots();
    const body = (patientId: string) => ({ patientId, doctorId: salazar.id, clinicId: centro.id, startsAt: slot.startsAt });
    const [a, b] = await Promise.all([
      http.post('/api/appointments').set(as('rosa')).send(body(patients[0].id)),
      http.post('/api/appointments').set(as('lucia')).send(body(patients[1].id)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('SLOT_TAKEN');
    expect(loser.body.message).toMatch(/ya tiene una cita/);
  });

  it('no deja al Dr. Salazar en Norte mientras atiende en Centro', async () => {
    const [, slot] = await nextFreeSlots();
    const res = await http.post('/api/appointments').set(as('rosa')).send({ patientId: patients[2].id, doctorId: salazar.id, clinicId: norte.id, startsAt: slot.startsAt });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Clínica Centro, no en Clínica Norte/);
  });

  it('rechaza fechas pasadas con un mensaje para personas', async () => {
    const res = await http
      .post('/api/appointments')
      .set(as('rosa'))
      .send({ patientId: patients[2].id, doctorId: salazar.id, clinicId: centro.id, startsAt: '2024-01-08T09:00:00-05:00' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ya pasó/);
  });

  it('un reintento con la misma Idempotency-Key no duplica la cita', async () => {
    const [, , slot] = await nextFreeSlots();
    const key = `test-${Date.now()}`;
    const send = () =>
      http.post('/api/appointments').set(as('rosa')).set('Idempotency-Key', key).send({ patientId: patients[3].id, doctorId: salazar.id, clinicId: centro.id, startsAt: slot.startsAt });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });
});

describe('Cancelación', () => {
  it('cancelar dos veces no es un error, y se puede deshacer', async () => {
    const [slot] = await nextFreeSlots();
    const created = await http.post('/api/appointments').set(as('rosa')).send({ patientId: patients[4].id, doctorId: salazar.id, clinicId: centro.id, startsAt: slot.startsAt }).expect(201);
    const id = created.body.id;

    const c1 = await http.post(`/api/appointments/${id}/cancel`).set(as('rosa')).send({ reason: 'PACIENTE_LLAMO' }).expect(200);
    const c2 = await http.post(`/api/appointments/${id}/cancel`).set(as('lucia')).send({ reason: 'PACIENTE_LLAMO' }).expect(200);
    expect(c1.body.alreadyCancelled).toBe(false);
    expect(c2.body.alreadyCancelled).toBe(true);

    const restored = await http.post(`/api/appointments/${id}/restore`).set(as('rosa')).expect(200);
    expect(restored.body.status).toBe('SCHEDULED');

    const events = await http.get(`/api/appointments/${id}/events`).set(as('paredes')).expect(200);
    expect(events.body.map((e: { type: string }) => e.type)).toEqual(['CREATED', 'CANCELLED', 'RESTORED']);
  });
});

describe('Privacidad', () => {
  it('la nota clínica la escribe el médico y recepción no la recibe', async () => {
    const list = await http.get('/api/appointments').query({ doctorId: salazar.id, status: 'SCHEDULED', pageSize: 1 }).set(as('rosa')).expect(200);
    const id = list.body.items[0].id;
    await http.patch(`/api/appointments/${id}/clinical-note`).set(as('salazar')).send({ clinicalNote: 'Control de HTA' }).expect(200);
    const asReception = await http.get(`/api/appointments/${id}`).set(as('rosa')).expect(200);
    expect(asReception.body).not.toHaveProperty('clinicalNote');
    await http.patch(`/api/appointments/${id}/clinical-note`).set(as('rosa')).send({ clinicalNote: 'x' }).expect(403);
  });

  it('solo la dirección ve la bitácora', async () => {
    await http.get('/api/audit').set(as('rosa')).expect(403);
    const res = await http.get('/api/audit').set(as('paredes')).expect(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('sin sesión no se ve nada', async () => {
    const res = await http.get('/api/patients').expect(401);
    expect(res.body.message).toMatch(/sesión/);
  });
});

describe('Calidad de datos', () => {
  it('explica cada dato inválido de un paciente', async () => {
    const res = await http
      .post('/api/patients')
      .set(as('rosa'))
      .send({ firstNames: 'Juan', lastNames: 'Pérez', birthDate: '2090-01-01', documentType: 'CEDULA', documentNumber: '0000000000', phone: '12345', email: 'juan@@gmail' })
      .expect(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['birthDate', 'documentNumber', 'email', 'phone']);
  });
});
