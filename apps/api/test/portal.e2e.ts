/**
 * Portal del paciente y horarios de clínicas. Usa un paciente de prueba con cédula fija: si ya tiene
 * cuenta (corridas anteriores), ingresa con ella; así se puede correr varias veces.
 *   cd apps/api && npx prisma migrate deploy && npm run seed && npm run test:e2e
 */
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClinicView, NotificationList, PortalAppointment, PortalSlot } from '@clinagenda/schemas';
import { AppModule } from '../src/app.module';

const STAFF_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo2026!';
// Cédula válida (dígito verificador correcto) inventada para pruebas.
const CEDULA = '1710034065';
const PASSWORD = 'Paciente2026';
const PATIENT = { documentType: 'CEDULA', documentNumber: CEDULA, firstNames: 'Prueba', lastNames: 'En Línea', birthDate: '1980-05-10', phone: '0991234567', password: PASSWORD, acceptPrivacy: true };

let app: INestApplication;
let http: ReturnType<typeof request>;
let patient: string;
let admin: string;
let centro: ClinicView;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Próximos horarios libres en Centro (desde mañana), vistos por el paciente. */
async function freeSlots(): Promise<PortalSlot[]> {
  for (let i = 1; i < 30; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    const res = await http.get('/api/portal/availability').query({ clinicId: centro.id, date }).set(bearer(patient)).expect(200);
    if (res.body.slots.length >= 3) return res.body.slots;
  }
  throw new Error('No hay horarios libres para probar');
}

async function cancelAllUpcoming() {
  const list: PortalAppointment[] = (await http.get('/api/portal/appointments').set(bearer(patient)).expect(200)).body;
  for (const a of list.filter((x) => (x.status === 'SCHEDULED' || x.status === 'REQUESTED') && x.canCancel)) {
    await http.post(`/api/portal/appointments/${a.id}/cancel`).set(bearer(patient)).expect(200);
  }
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.init();
  http = request(app.getHttpServer());

  const reg = await http.post('/api/portal/register').send(PATIENT);
  if (reg.status === 201) patient = reg.body.accessToken;
  else patient = (await http.post('/api/portal/login').send({ documentNumber: CEDULA, password: PASSWORD }).expect(200)).body.accessToken;

  admin = (await http.post('/api/auth/login').send({ username: 'paredes', password: STAFF_PASSWORD }).expect(200)).body.accessToken;
  const clinics: ClinicView[] = (await http.get('/api/clinics').set(bearer(admin))).body;
  centro = clinics.find((c) => c.name === 'Clínica Centro')!;
  await cancelAllUpcoming();
});

afterAll(async () => {
  if (patient) await cancelAllUpcoming();
  await app?.close();
});

describe('Portal del paciente', () => {
  it('no deja crear una segunda cuenta con el mismo documento', async () => {
    const res = await http.post('/api/portal/register').send(PATIENT).expect(400);
    expect(res.body.fields.documentNumber).toBeTruthy();
  });

  it('no deja tomar la ficha de otra persona sabiendo solo su cédula', async () => {
    const { body } = await http.get('/api/patients').query({ pageSize: 50 }).set(bearer(admin));
    const other = body.items.find((p: { documentType: string; documentNumber: string | null; age: number }) => p.documentType === 'CEDULA' && p.documentNumber && p.age >= 18);
    const res = await http
      .post('/api/portal/register')
      .send({ ...PATIENT, documentNumber: other.documentNumber, birthDate: '1990-01-01', phone: '0987654321' })
      .expect(409);
    expect(res.body.message).toMatch(/no coinciden/);
  });

  it('los menores no crean cuenta en línea', async () => {
    const res = await http.post('/api/portal/register').send({ ...PATIENT, documentNumber: '0102030405', birthDate: '2015-01-01' }).expect(400);
    expect(res.body.fields.birthDate).toMatch(/mayores de edad/);
  });

  it('solicita, ve su cita y aparece en la agenda de recepción para aceptarla', async () => {
    const [slot] = await freeSlots();
    const created: PortalAppointment = (
      await http.post('/api/portal/appointments').set(bearer(patient)).send({ clinicId: centro.id, doctorId: slot.doctorId, startsAt: slot.startsAt }).expect(201)
    ).body;
    expect(created.status).toBe('REQUESTED');
    const mine: PortalAppointment[] = (await http.get('/api/portal/appointments').set(bearer(patient))).body;
    expect(mine.some((a) => a.id === created.id)).toBe(true);

    const staff = await http.get(`/api/appointments/${created.id}`).set(bearer(admin)).expect(200);
    expect(staff.body.patient.fullName).toContain('Prueba');
    const events = await http.get(`/api/appointments/${created.id}/events`).set(bearer(admin)).expect(200);
    expect(events.body[0].summary).toMatch(/en línea/);

    // No se marca asistencia de una solicitud sin aceptar; recepción la acepta y pasa a agendada.
    await http.patch(`/api/appointments/${created.id}/status`).set(bearer(admin)).send({ status: 'ATTENDED' }).expect(400);
    const accepted = await http.post(`/api/appointments/${created.id}/accept`).set(bearer(admin)).expect(200);
    expect(accepted.body.status).toBe('SCHEDULED');
    const again = await http.post(`/api/appointments/${created.id}/accept`).set(bearer(admin)).expect(200);
    expect(again.body.status).toBe('SCHEDULED');
  });

  it('recepción puede rechazar una solicitud con una nota y el horario se libera', async () => {
    const slots = await freeSlots();
    const s = slots[slots.length - 1];
    const created: PortalAppointment = (await http.post('/api/portal/appointments').set(bearer(patient)).send({ clinicId: centro.id, doctorId: s.doctorId, startsAt: s.startsAt }).expect(201)).body;
    const rejected = await http.post(`/api/appointments/${created.id}/reject`).set(bearer(admin)).send({ note: 'El médico estará en un congreso' }).expect(200);
    expect(rejected.body.status).toBe('CANCELLED');
    const mine: PortalAppointment[] = (await http.get('/api/portal/appointments').set(bearer(patient))).body;
    expect(mine.find((a) => a.id === created.id)?.status).toBe('CANCELLED');
    const date = s.startsAt.slice(0, 10);
    const after = await http.get('/api/portal/availability').query({ clinicId: centro.id, date, doctorId: s.doctorId }).set(bearer(patient));
    expect(after.body.slots.some((x: PortalSlot) => x.startsAt === s.startsAt)).toBe(true);
  });

  it('descarga el comprobante en PDF (el paciente y el personal)', async () => {
    const mine: PortalAppointment[] = (await http.get('/api/portal/appointments').set(bearer(patient))).body;
    const target = mine.find((a) => a.status === 'SCHEDULED' || a.status === 'REQUESTED')!;
    const pdf = await http.get(`/api/portal/appointments/${target.id}/comprobante.pdf`).set(bearer(patient)).buffer(true).parse((res, cb) => {
      const parts: Buffer[] = [];
      res.on('data', (c: Buffer) => parts.push(c));
      res.on('end', () => cb(null, Buffer.concat(parts)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain(`comprobante-${target.code}.pdf`);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await http.get(`/api/appointments/${target.id}/comprobante.pdf`).set(bearer(admin)).expect(200);
    // Una cita de otro paciente no se puede descargar desde el portal.
    const other = (await http.get('/api/appointments').query({ pageSize: 1 }).set(bearer(admin))).body.items[0];
    if (other.id !== target.id) await http.get(`/api/portal/appointments/${other.id}/comprobante.pdf`).set(bearer(patient)).expect(404);
  });

  it('máximo 2 citas por venir', async () => {
    const slots = await freeSlots();
    const upcoming = (await http.get('/api/portal/appointments').set(bearer(patient))).body.filter((a: PortalAppointment) => a.status === 'SCHEDULED' || a.status === 'REQUESTED').length;
    for (let i = upcoming; i < 2; i++) {
      await http.post('/api/portal/appointments').set(bearer(patient)).send({ clinicId: centro.id, doctorId: slots[i + 1].doctorId, startsAt: slots[i + 1].startsAt }).expect(201);
    }
    const res = await http.post('/api/portal/appointments').set(bearer(patient)).send({ clinicId: centro.id, doctorId: slots[2].doctorId, startsAt: slots[2].startsAt }).expect(409);
    expect(res.body.message).toMatch(/máximo/);
  });

  it('no se agenda con menos de 2 horas de anticipación', async () => {
    const soon = new Date(Date.now() + 30 * 60000).toISOString();
    const [slot] = await freeSlots();
    await http.post('/api/portal/appointments').set(bearer(patient)).send({ clinicId: centro.id, doctorId: slot.doctorId, startsAt: soon }).expect(400);
  });

  it('cancela su propia cita', async () => {
    const mine: PortalAppointment[] = (await http.get('/api/portal/appointments').set(bearer(patient))).body;
    const target = mine.find((a) => a.status === 'SCHEDULED' || a.status === 'REQUESTED')!;
    const res = await http.post(`/api/portal/appointments/${target.id}/cancel`).set(bearer(patient)).expect(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('la sesión de paciente no abre el sistema interno, y la del personal no abre el portal', async () => {
    await http.get('/api/appointments').set(bearer(patient)).expect(401);
    await http.get('/api/auth/me').set(bearer(patient)).expect(401);
    await http.get('/api/portal/me').set(bearer(admin)).expect(401);
  });
});

describe('Avisos internos', () => {
  const kinds = (body: NotificationList, appointmentId: string) => body.items.filter((n) => n.appointmentId === appointmentId).map((n) => n.kind);

  it('el personal recibe la solicitud; el paciente, la confirmación y el cambio de hora', async () => {
    await cancelAllUpcoming();
    await http.post('/api/portal/notifications/read-all').set(bearer(patient)).expect(200);
    const [a, b] = await freeSlots();
    const created: PortalAppointment = (await http.post('/api/portal/appointments').set(bearer(patient)).send({ clinicId: centro.id, doctorId: a.doctorId, startsAt: a.startsAt }).expect(201)).body;

    const staff: NotificationList = (await http.get('/api/notifications').set(bearer(admin)).expect(200)).body;
    expect(kinds(staff, created.id)).toEqual(['SOLICITUD_NUEVA']);
    expect(staff.unread).toBeGreaterThan(0);
    const request = staff.items.find((n) => n.appointmentId === created.id)!;
    expect(request.link).toContain(`clinica=${centro.id}`);

    await http.post(`/api/appointments/${created.id}/accept`).set(bearer(admin)).expect(200);
    await http.patch(`/api/appointments/${created.id}/reschedule`).set(bearer(admin)).send({ startsAt: b.startsAt, doctorId: b.doctorId, clinicId: centro.id }).expect(200);
    const mine: NotificationList = (await http.get('/api/portal/notifications').set(bearer(patient)).expect(200)).body;
    expect(kinds(mine, created.id)).toEqual(['CITA_MOVIDA', 'CITA_ACEPTADA']);
    expect(mine.unread).toBe(2);
    expect(mine.items[0].body).toMatch(/Antes: .* Ahora: /);

    // Marcar como leído: uno, y después todos. El paciente no puede tocar los avisos del personal.
    const one: NotificationList = (await http.post(`/api/portal/notifications/${mine.items[0].id}/read`).set(bearer(patient)).expect(200)).body;
    expect(one.unread).toBe(1);
    await http.post(`/api/portal/notifications/${request.id}/read`).set(bearer(patient)).expect(404);
    expect((await http.post('/api/portal/notifications/read-all').set(bearer(patient)).expect(200)).body.unread).toBe(0);

    // Si el paciente cancela, el personal se entera.
    await http.post(`/api/portal/appointments/${created.id}/cancel`).set(bearer(patient)).expect(200);
    const after: NotificationList = (await http.get('/api/notifications').set(bearer(admin)).expect(200)).body;
    expect(kinds(after, created.id)).toEqual(['CANCELADA_POR_PACIENTE', 'SOLICITUD_NUEVA']);
    await http.post('/api/notifications/read-all').set(bearer(admin)).expect(200);
  });
});

describe('Mi perfil', () => {
  it('el paciente ve sus datos y corrige su celular, correo y dirección', async () => {
    const me = (await http.get('/api/portal/me').set(bearer(patient)).expect(200)).body;
    expect(me.documentNumber).toBe(CEDULA);
    expect(me.age).toBeGreaterThan(18);
    const res = await http.patch('/api/portal/me').set(bearer(patient)).send({ phone: '099 765 4321', email: 'Prueba@Correo.ec', address: '  Av.  Amazonas  ' }).expect(200);
    expect(res.body.phone).toBe('+593997654321');
    expect(res.body.email).toBe('prueba@correo.ec');
    expect(res.body.address).toBe('Av. Amazonas');
    await http.patch('/api/portal/me').set(bearer(patient)).send({ phone: '12345' }).expect(400);
    await http.patch('/api/portal/me').set(bearer(patient)).send({ phone: PATIENT.phone }).expect(200);
  });

  it('cambiar la contraseña exige la actual y cierra las demás sesiones', async () => {
    await http.post('/api/portal/me/password').set(bearer(patient)).send({ currentPassword: 'equivocada1', newPassword: 'Nueva2026x' }).expect(400);
    const res = await http.post('/api/portal/me/password').set(bearer(patient)).send({ currentPassword: PASSWORD, newPassword: 'Nueva2026x' }).expect(200);
    const fresh = String(res.headers['set-cookie']).match(/clinagenda_paciente=([^;]+)/)![1];
    await http.get('/api/portal/me').set(bearer(patient)).expect(401);
    // Vuelve a la contraseña de siempre para que las pruebas se puedan repetir.
    await http.post('/api/portal/me/password').set(bearer(fresh)).send({ currentPassword: 'Nueva2026x', newPassword: PASSWORD }).expect(200);
    patient = (await http.post('/api/portal/login').send({ documentNumber: CEDULA, password: PASSWORD }).expect(200)).body.accessToken;
  });
});

describe('Ingreso único', () => {
  it('el mismo formulario abre la sesión del personal o la del paciente', async () => {
    const staff = await http.post('/api/auth/sign-in').send({ identifier: 'Paredes', password: STAFF_PASSWORD }).expect(200);
    expect(staff.body.kind).toBe('staff');
    expect(String(staff.headers['set-cookie'])).toContain('clinagenda_session=');

    const pat = await http.post('/api/auth/sign-in').send({ identifier: CEDULA, password: PASSWORD }).expect(200);
    expect(pat.body.kind).toBe('patient');
    expect(String(pat.headers['set-cookie'])).toContain('clinagenda_paciente=');
  });

  it('el mensaje de error no revela si el usuario o el documento existen', async () => {
    const a = await http.post('/api/auth/sign-in').send({ identifier: 'paredes', password: 'incorrecta1' }).expect(400);
    const b = await http.post('/api/auth/sign-in').send({ identifier: CEDULA, password: 'incorrecta1' }).expect(400);
    const c = await http.post('/api/auth/sign-in').send({ identifier: 'nadie.existe', password: 'incorrecta1' }).expect(400);
    expect(a.body.message).toBe(b.body.message);
    expect(b.body.message).toBe(c.body.message);
  });
});

describe('Horarios de las clínicas', () => {
  it('acortar el horario no cancela citas: devuelve las que quedan fuera', async () => {
    const original = centro.schedule;
    // Solo lunes de 08:00 a 09:00: casi todas las citas futuras de Centro quedan fuera.
    const res = await http
      .patch(`/api/clinics/${centro.id}`)
      .set(bearer(admin))
      .send({ schedule: [{ weekday: 1, startTime: '08:00', endTime: '09:00' }] })
      .expect(200);
    expect(res.body.appointmentsOutsideSchedule.length).toBeGreaterThan(0);
    expect(res.body.appointmentsOutsideSchedule[0].doctorName).toBeTruthy();
    const after = await http.patch(`/api/clinics/${centro.id}`).set(bearer(admin)).send({ schedule: original }).expect(200);
    expect(after.body.schedule).toEqual(original);
  });

  it('un horario que se cruza se rechaza', async () => {
    await http
      .patch(`/api/clinics/${centro.id}`)
      .set(bearer(admin))
      .send({ schedule: [{ weekday: 1, startTime: '08:00', endTime: '12:00' }, { weekday: 1, startTime: '11:00', endTime: '13:00' }] })
      .expect(400);
  });

  it('se puede quitar un cierre puesto por error', async () => {
    const date = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const created = await http.post(`/api/clinics/${centro.id}/closures`).set(bearer(admin)).send({ date, reason: 'Prueba automática' }).expect(201);
    await http.delete(`/api/clinics/${centro.id}/closures/${created.body.id}`).set(bearer(admin)).expect(200);
    await http.delete(`/api/clinics/${centro.id}/closures/${created.body.id}`).set(bearer(admin)).expect(404);
  });
});
