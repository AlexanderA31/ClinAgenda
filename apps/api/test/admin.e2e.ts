/**
 * Administración: roles con permisos a medida, cierre de sesiones y protecciones contra quedarse
 * sin administrador. Usa un rol y un usuario de prueba fijos, así se puede correr varias veces.
 *   cd apps/api && npx prisma migrate deploy && npm run seed && npm run test:e2e
 */
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM_ROLE_IDS, type AppointmentView, type ClinicView, type RoleView, type SessionUser, type UserView } from '@clinagenda/schemas';
import { AppModule } from '../src/app.module';

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo2026!';
const TEST_ROLE = 'Rol de prueba automática';
const TEST_USER = 'prueba.e2e';
const TEST_PASSWORD = 'Prueba2026x';

let app: INestApplication;
let http: ReturnType<typeof request>;
let admin: string;
let role: RoleView;
let user: UserView;
/** Sesión del usuario de prueba. El login está limitado a 10 intentos por minuto, así que se reutiliza. */
let userToken: string;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(username: string, password: string) {
  const res = await http.post('/api/auth/login').send({ username, password }).expect(200);
  return res.body.accessToken as string;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.init();
  http = request(app.getHttpServer());
  admin = await login('paredes', PASSWORD);

  // Rol de prueba sin permisos y un usuario con ese rol (se reutilizan entre corridas).
  const roles: RoleView[] = (await http.get('/api/roles').set(bearer(admin)).expect(200)).body;
  role =
    roles.find((r) => r.name === TEST_ROLE) ??
    (await http.post('/api/roles').set(bearer(admin)).send({ name: TEST_ROLE, scope: 'RECEPCION', permissions: [] }).expect(201)).body;
  role = (await http.patch(`/api/roles/${role.id}`).set(bearer(admin)).send({ permissions: [] }).expect(200)).body;

  const users: UserView[] = (await http.get('/api/users').set(bearer(admin))).body;
  const existing = users.find((u) => u.username === TEST_USER);
  user = existing
    ? (await http.patch(`/api/users/${existing.id}`).set(bearer(admin)).send({ active: true, roleId: role.id, resetPassword: TEST_PASSWORD }).expect(200)).body
    : (await http.post('/api/users').set(bearer(admin)).send({ username: TEST_USER, fullName: 'Usuario De Prueba', roleId: role.id, password: TEST_PASSWORD }).expect(201)).body;
  userToken = await login(TEST_USER, TEST_PASSWORD);
});

afterAll(async () => {
  if (user) await http.patch(`/api/users/${user.id}`).set(bearer(admin)).send({ active: false });
  await app?.close();
});

describe('Roles y permisos', () => {
  it('un permiso dado o quitado por la dirección vale de inmediato, sin volver a ingresar', async () => {
    const token = userToken;
    await http.get('/api/waitlist').set(bearer(token)).expect(403);

    await http.patch(`/api/roles/${role.id}`).set(bearer(admin)).send({ permissions: ['lista_espera.gestionar'] }).expect(200);
    await http.get('/api/waitlist').set(bearer(token)).expect(200);
    const me: SessionUser = (await http.get('/api/auth/me').set(bearer(token)).expect(200)).body;
    expect(me.permissions).toEqual(['lista_espera.gestionar']);
    expect(me.roleName).toBe(TEST_ROLE);

    await http.patch(`/api/roles/${role.id}`).set(bearer(admin)).send({ permissions: [] }).expect(200);
    await http.get('/api/waitlist').set(bearer(token)).expect(403);
  });

  it('el rol de dirección no se puede editar ni borrar', async () => {
    await http.patch(`/api/roles/${SYSTEM_ROLE_IDS.ADMIN}`).set(bearer(admin)).send({ permissions: [] }).expect(400);
    await http.delete(`/api/roles/${SYSTEM_ROLE_IDS.ADMIN}`).set(bearer(admin)).expect(400);
  });

  it('un rol con usuarios no se borra', async () => {
    const res = await http.delete(`/api/roles/${role.id}`).set(bearer(admin)).expect(409);
    expect(res.body.message).toMatch(/usuario/);
  });

  it('un permiso que no existe se rechaza', async () => {
    await http.patch(`/api/roles/${role.id}`).set(bearer(admin)).send({ permissions: ['todo.poder'] }).expect(400);
  });

  it('un rol "solo su agenda" exige vincular la ficha del médico', async () => {
    const res = await http
      .post('/api/users')
      .set(bearer(admin))
      .send({ username: 'medico.sin.ficha', fullName: 'Médico Sin Ficha', roleId: SYSTEM_ROLE_IDS.MEDICO, password: TEST_PASSWORD })
      .expect(400);
    expect(res.body.fields.doctorId).toBeTruthy();
  });
});

describe('Accesos', () => {
  it('cerrar las sesiones invalida los ingresos anteriores', async () => {
    await http.get('/api/auth/me').set(bearer(userToken)).expect(200);
    await http.post(`/api/users/${user.id}/revoke-sessions`).set(bearer(admin)).expect(200);
    await http.get('/api/auth/me').set(bearer(userToken)).expect(401);
  });

  it('desbloquear permite ingresar sin esperar los 15 minutos', async () => {
    for (let i = 0; i < 5; i++) await http.post('/api/auth/login').send({ username: TEST_USER, password: 'incorrecta1' });
    await http.post('/api/auth/login').send({ username: TEST_USER, password: TEST_PASSWORD }).expect(429);
    const res = await http.post(`/api/users/${user.id}/unlock`).set(bearer(admin)).expect(200);
    expect(res.body.lockedUntil).toBeNull();
    userToken = await login(TEST_USER, TEST_PASSWORD);
  });

  it('la dirección no puede quitarse su propio rol', async () => {
    const me: SessionUser = (await http.get('/api/auth/me').set(bearer(admin))).body;
    await http.patch(`/api/users/${me.id}`).set(bearer(admin)).send({ roleId: SYSTEM_ROLE_IDS.RECEPCION }).expect(400);
  });

  it('sin permiso de usuarios no se ve la lista de usuarios ni el estado del sistema', async () => {
    await http.get('/api/users').set(bearer(userToken)).expect(403);
    await http.get('/api/system/status').set(bearer(userToken)).expect(403);
    const status = await http.get('/api/system/status').set(bearer(admin)).expect(200);
    expect(status.body.users.active).toBeGreaterThan(0);
  });
});

describe('Clínicas de trabajo', () => {
  it('quien trabaja en una clínica solo da y maneja citas ahí, pero ve la historia completa del paciente', async () => {
    const clinics: ClinicView[] = (await http.get('/api/clinics').set(bearer(admin)).expect(200)).body;
    const norte = clinics.find((c) => c.name === 'Clínica Norte')!;
    const centro = clinics.find((c) => c.name === 'Clínica Centro')!;
    await http.patch(`/api/roles/${role.id}`).set(bearer(admin)).send({ permissions: ['citas.agendar', 'lista_espera.gestionar'] }).expect(200);
    const assigned: UserView = (await http.patch(`/api/users/${user.id}`).set(bearer(admin)).send({ clinicIds: [norte.id, norte.id] }).expect(200)).body;
    expect(assigned.clinicIds).toEqual([norte.id]);
    const me: SessionUser = (await http.get('/api/auth/me').set(bearer(userToken)).expect(200)).body;
    expect(me.clinicIds).toEqual([norte.id]);

    // Listas: solo su clínica; pedir otra es un 403 claro.
    const today = new Date().toISOString().slice(0, 10);
    const mine = (await http.get('/api/appointments').query({ from: today, pageSize: 100 }).set(bearer(userToken)).expect(200)).body.items as AppointmentView[];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((a) => a.clinic.id === norte.id)).toBe(true);
    await http.get('/api/appointments').query({ clinicId: centro.id }).set(bearer(userToken)).expect(403);
    await http.get('/api/waitlist').query({ clinicId: centro.id }).set(bearer(userToken)).expect(403);
    const waiting = (await http.get('/api/waitlist').set(bearer(userToken)).expect(200)).body as { clinic: { id: string } }[];
    expect(waiting.every((w) => w.clinic.id === norte.id)).toBe(true);

    // Una cita de Centro: no la puede dar, cancelar ni mover, pero sí verla en la historia del paciente.
    const other = ((await http.get('/api/appointments').query({ clinicId: centro.id, status: 'SCHEDULED', from: today, pageSize: 1 }).set(bearer(admin)).expect(200)).body.items as AppointmentView[])[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();
    await http.post('/api/appointments').set(bearer(userToken)).send({ patientId: other.patient.id, doctorId: other.doctor.id, clinicId: centro.id, startsAt: nextWeek }).expect(403);
    await http.post(`/api/appointments/${other.id}/cancel`).set(bearer(userToken)).send({ reason: 'PACIENTE_LLAMO' }).expect(403);
    await http.patch(`/api/appointments/${other.id}/reschedule`).set(bearer(userToken)).send({ startsAt: nextWeek }).expect(403);
    const history = (await http.get('/api/appointments').query({ patientId: other.patient.id }).set(bearer(userToken)).expect(200)).body.items as AppointmentView[];
    expect(history.some((a) => a.id === other.id)).toBe(true);
    expect((await http.get(`/api/appointments/${other.id}`).set(bearer(admin)).expect(200)).body.status).toBe('SCHEDULED');

    // Sin clínicas marcadas: trabaja en todas.
    const all: UserView = (await http.patch(`/api/users/${user.id}`).set(bearer(admin)).send({ clinicIds: [] }).expect(200)).body;
    expect(all.clinicIds).toEqual([]);
    await http.get('/api/appointments').query({ clinicId: centro.id }).set(bearer(userToken)).expect(200);
    await http.patch(`/api/roles/${role.id}`).set(bearer(admin)).send({ permissions: [] }).expect(200);
  });

  it('no se puede asignar una clínica que no existe', async () => {
    await http.patch(`/api/users/${user.id}`).set(bearer(admin)).send({ clinicIds: ['00000000-0000-4000-8000-000000000000'] }).expect(400);
  });
});
