/**
 * Carga inicial de la base. Dos modos (variable SEED_MODE):
 *   demo    (predeterminado) — datos de demostración INVENTADOS, descritos abajo.
 *   inicial — para la instalación real: solo las 3 clínicas con un horario base y el usuario
 *             `admin` (dirección), que debe cambiar su contraseña al primer ingreso.
 *
 * Datos de demostración INVENTADOS (ninguna persona real).
 * Se puede ejecutar varias veces: si ya hay clínicas, no hace nada.
 *
 * Usuarios creados (contraseña = SEED_DEMO_PASSWORD, por defecto "Demo2026!"):
 *   paredes  → Dirección (Dra. Paredes)
 *   rosa     → Recepción Clínica Centro (doña Rosa)
 *   lucia    → Coordinación de recepción (rol creado a medida: además ve el panel y une duplicados)
 *   andrea, carmen, pilar → Recepción
 *   salazar  → Médico (Dr. Salazar, atiende en Centro y Norte)
 */
import { PrismaClient, type AppointmentStatus, type CancelReason } from '@prisma/client';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import { SYSTEM_ROLE_IDS, checkPhone, normalizeForSearch } from '@clinagenda/schemas';

const prisma = new PrismaClient();
const TZ = 'America/Guayaquil';

// Generador pseudoaleatorio con semilla: los datos salen iguales en cada instalación.
let seed = 20261118;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pickOne = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];

function cedula(province: number): string {
  const base = String(province).padStart(2, '0') + String(Math.floor(rand() * 6)) + String(Math.floor(rand() * 1_000_000)).padStart(6, '0');
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const sum = coef.reduce((acc, c, i) => {
    const p = Number(base[i]) * c;
    return acc + (p > 9 ? p - 9 : p);
  }, 0);
  return base + ((10 - (sum % 10)) % 10);
}

function mobile(): string {
  const raw = `09${pickOne(['8', '9'])}${String(Math.floor(rand() * 10_000_000)).padStart(7, '0')}`;
  const r = checkPhone(raw);
  return r.ok ? r.e164 : '+593991234567';
}

const FIRST_F = ['María', 'Ana', 'Rosa', 'Lucía', 'Carmen', 'Gabriela', 'Daniela', 'Valentina', 'Sofía', 'Fernanda', 'Mercedes', 'Jessica', 'Paola'];
const FIRST_M = ['José', 'Luis', 'Carlos', 'Juan', 'Jorge', 'Andrés', 'Diego', 'Miguel', 'Fernando', 'Mateo', 'Santiago', 'Patricio', 'Segundo'];
const LAST = ['Pérez', 'López', 'Guamán', 'Quishpe', 'Andrade', 'Mora', 'Vera', 'Cevallos', 'Zambrano', 'Chávez', 'Torres', 'Paucar', 'Villacís', 'Jaramillo', 'Benítez', 'Ortiz', 'Salinas', 'Toapanta'];

async function main() {
  if ((await prisma.clinic.count()) > 0) {
    console.log('La base ya tiene datos; el seed no hace nada.');
    return;
  }
  const password = await argon2.hash(process.env.SEED_DEMO_PASSWORD ?? 'Demo2026!');

  if (process.env.SEED_MODE === 'inicial') {
    const base = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '08:00', endTime: '17:00' }));
    for (const [name, slotMinutes] of [['Clínica Centro', 30], ['Clínica Norte', 30], ['Clínica Sur', 20]] as const) {
      await prisma.clinic.create({ data: { name, slotMinutes, schedules: { create: base } } });
    }
    await prisma.user.create({
      data: { username: 'admin', fullName: 'Dirección', role: 'ADMIN', accessRoleId: SYSTEM_ROLE_IDS.ADMIN, passwordHash: password, mustChangePassword: true },
    });
    console.log('Carga inicial lista: 3 clínicas y el usuario "admin" (debe cambiar la contraseña al ingresar).');
    return;
  }

  // --- Clínicas (horarios distintos a propósito) ---
  const weekdays = [1, 2, 3, 4, 5];
  const centro = await prisma.clinic.create({
    data: {
      name: 'Clínica Centro',
      address: 'Av. 10 de Agosto y Riofrío',
      phone: '022456789',
      slotMinutes: 30,
      schedules: { create: [...weekdays.map((weekday) => ({ weekday, startTime: '08:00', endTime: '18:00' })), { weekday: 6, startTime: '08:00', endTime: '12:00' }] },
    },
  });
  const norte = await prisma.clinic.create({
    data: {
      name: 'Clínica Norte',
      address: 'Av. Eloy Alfaro y Portugal',
      phone: '022987654',
      slotMinutes: 30,
      schedules: { create: weekdays.map((weekday) => ({ weekday, startTime: '07:30', endTime: '17:30' })) },
    },
  });
  const sur = await prisma.clinic.create({
    data: {
      name: 'Clínica Sur',
      address: 'Av. Maldonado y Morán Valverde',
      phone: '023123456',
      slotMinutes: 20,
      schedules: { create: [...weekdays.map((weekday) => ({ weekday, startTime: '07:00', endTime: '15:00' })), { weekday: 6, startTime: '07:00', endTime: '11:00' }] },
    },
  });

  // --- Médicos (12) ---
  type A = { clinicId: string; weekday: number; startTime: string; endTime: string };
  const full = (clinicId: string, start: string, end: string, days = weekdays): A[] => days.map((weekday) => ({ clinicId, weekday, startTime: start, endTime: end }));
  const doctorsData: { fullName: string; specialty: string; assignments: A[] }[] = [
    {
      // Atiende en dos clínicas: mañanas en Centro (lun-mié-vie), Norte mar-jue, y lunes por la tarde en Norte.
      fullName: 'Ernesto Salazar',
      specialty: 'Medicina interna',
      assignments: [
        ...full(centro.id, '08:00', '13:00', [1, 3, 5]),
        ...full(norte.id, '08:00', '16:00', [2, 4]),
        { clinicId: norte.id, weekday: 1, startTime: '14:30', endTime: '17:30' },
      ],
    },
    { fullName: 'Verónica Paredes', specialty: 'Medicina familiar', assignments: full(centro.id, '09:00', '13:00', [2, 4]) },
    { fullName: 'Andrés Villacís', specialty: 'Pediatría', assignments: full(centro.id, '08:00', '14:00') },
    { fullName: 'Marcela Ortiz', specialty: 'Ginecología', assignments: full(centro.id, '13:00', '18:00') },
    { fullName: 'Diego Benítez', specialty: 'Traumatología', assignments: full(centro.id, '08:00', '12:00', [6]).concat(full(norte.id, '13:00', '17:30', [1, 3, 5])) },
    { fullName: 'Gabriela Torres', specialty: 'Pediatría', assignments: full(norte.id, '07:30', '13:00') },
    { fullName: 'Fernando Jaramillo', specialty: 'Cardiología', assignments: full(norte.id, '08:00', '12:00', [1, 3, 5]) },
    { fullName: 'Paola Cevallos', specialty: 'Dermatología', assignments: full(norte.id, '13:00', '17:30', [2, 4]) },
    { fullName: 'Luis Quishpe', specialty: 'Medicina general', assignments: full(sur.id, '07:00', '15:00') },
    { fullName: 'Rosa Guamán', specialty: 'Pediatría', assignments: full(sur.id, '07:00', '11:00', [1, 2, 3, 4, 5, 6]) },
    { fullName: 'Jorge Zambrano', specialty: 'Odontología', assignments: full(sur.id, '11:00', '15:00') },
    { fullName: 'Lucía Mora', specialty: 'Geriatría', assignments: full(sur.id, '07:00', '11:00', [2, 4]).concat(full(centro.id, '14:00', '18:00', [1, 3])) },
  ];
  const doctors = [];
  for (const d of doctorsData) {
    doctors.push(await prisma.doctor.create({ data: { fullName: d.fullName, specialty: d.specialty, assignments: { create: d.assignments } }, include: { assignments: true } }));
  }
  const salazar = doctors[0];

  // --- Usuarios ---
  const users = [
    { username: 'paredes', fullName: 'Verónica Paredes', role: 'ADMIN' as const, doctorId: doctors[1].id },
    { username: 'rosa', fullName: 'Rosa Elvira Chávez', role: 'RECEPCION' as const, clinicId: centro.id },
    { username: 'lucia', fullName: 'Lucía Andrade', role: 'RECEPCION' as const, clinicId: centro.id },
    { username: 'andrea', fullName: 'Andrea Vera', role: 'RECEPCION' as const, clinicId: norte.id },
    { username: 'carmen', fullName: 'Carmen Salinas', role: 'RECEPCION' as const, clinicId: sur.id },
    { username: 'pilar', fullName: 'Pilar Toapanta', role: 'RECEPCION' as const, clinicId: sur.id },
    { username: 'salazar', fullName: 'Ernesto Salazar', role: 'MEDICO' as const, doctorId: salazar.id },
  ];
  // Un rol creado por la dirección, para mostrar que los permisos se arman a medida.
  const coordinacion = await prisma.accessRole.create({
    data: {
      name: 'Coordinación de recepción',
      description: 'Recepcionista que además revisa el panel y une pacientes duplicados.',
      scope: 'RECEPCION',
      permissions: ['citas.agendar', 'citas.estado', 'recordatorios.gestionar', 'lista_espera.gestionar', 'pacientes.editar', 'pacientes.fusionar', 'panel.ver'],
    },
  });
  const roleId = (u: (typeof users)[number]) => (u.username === 'lucia' ? coordinacion.id : SYSTEM_ROLE_IDS[u.role]);
  const admin = await prisma.user.create({ data: { ...users[0], accessRoleId: roleId(users[0]), passwordHash: password } });
  for (const u of users.slice(1)) await prisma.user.create({ data: { ...u, accessRoleId: roleId(u), passwordHash: password } });

  // --- Pacientes (casos variados a propósito) ---
  const today = DateTime.now().setZone(TZ);
  const patients = [];
  for (let i = 0; i < 160; i++) {
    const female = rand() < 0.55;
    const firstNames = `${pickOne(female ? FIRST_F : FIRST_M)} ${pickOne(female ? FIRST_F : FIRST_M)}`;
    const lastNames = `${pickOne(LAST)} ${pickOne(LAST)}`;
    const age = i % 7 === 0 ? 2 + Math.floor(rand() * 14) : i % 9 === 0 ? 70 + Math.floor(rand() * 20) : 19 + Math.floor(rand() * 50);
    const birth = today.minus({ years: age, days: Math.floor(rand() * 365) }).toISODate()!;
    const minor = age < 18;
    const noDoc = i % 13 === 5;
    const foreign = i % 17 === 3;
    patients.push(
      await prisma.patient.create({
        data: {
          firstNames,
          lastNames,
          nameNormalized: normalizeForSearch(`${firstNames} ${lastNames}`),
          birthDate: new Date(`${birth}T00:00:00Z`),
          birthDateEstimated: age >= 85,
          sex: female ? 'F' : 'M',
          documentType: noDoc ? 'SIN_DOCUMENTO' : foreign ? 'PASAPORTE' : 'CEDULA',
          documentNumber: noDoc ? null : foreign ? `AX${Math.floor(rand() * 9_000_000 + 1_000_000)}` : cedula(pickOne([17, 17, 17, 9, 1, 18, 10])),
          noDocumentReason: noDoc ? (minor ? 'Menor aún sin cédula' : 'Perdió la cédula; está tramitando una nueva') : null,
          phone: minor || i % 11 === 4 ? null : mobile(),
          email: i % 4 === 0 ? `paciente${i}@ejemplo.ec` : null,
          contactNote: !minor && i % 11 === 4 ? 'No tiene teléfono. Avisar a su hija en la tienda frente a la Clínica Sur.' : null,
          guardianName: minor ? `${pickOne(FIRST_F)} ${lastNames.split(' ')[0]}` : null,
          guardianRelationship: minor ? 'Madre' : null,
          guardianPhone: minor ? mobile() : null,
          createdById: admin.id,
        },
      }),
    );
  }

  // --- Citas: últimas 5 semanas (historial) y próximas 2 semanas ---
  const busyPatient = new Map<string, { s: number; e: number }[]>();
  const reasons = ['Control', 'Dolor de cabeza', 'Chequeo anual', 'Revisión de exámenes', 'Fiebre', 'Control de presión', 'Vacunación', 'Dolor de espalda'];
  const cancelReasons: CancelReason[] = ['PACIENTE_LLAMO', 'PACIENTE_LLAMO', 'MEDICO_NO_DISPONIBLE', 'REPROGRAMADA', 'ERROR_AL_AGENDAR'];
  const clinicById = new Map([centro, norte, sur].map((c) => [c.id, c]));
  let created = 0;

  for (let offset = -35; offset <= 14; offset++) {
    const day = today.plus({ days: offset }).startOf('day');
    const weekday = day.weekday % 7;
    for (const doctor of doctors) {
      for (const a of doctor.assignments.filter((x) => x.weekday === weekday)) {
        const clinic = clinicById.get(a.clinicId)!;
        const [sh, sm] = a.startTime.split(':').map(Number);
        const [eh, em] = a.endTime.split(':').map(Number);
        for (let m = sh * 60 + sm; m + clinic.slotMinutes <= eh * 60 + em; m += clinic.slotMinutes) {
          const fill = offset < 0 ? 0.24 : offset < 3 ? 0.3 : 0.12;
          if (rand() > fill) continue;
          const start = day.plus({ minutes: m });
          if (offset >= 0 && start < today) continue;
          const s = start.toMillis();
          const e = s + clinic.slotMinutes * 60000;
          const patient = pickOne(patients);
          const slots = busyPatient.get(patient.id) ?? [];
          if (slots.some((x) => x.s < e && s < x.e)) continue;
          slots.push({ s, e });
          busyPatient.set(patient.id, slots);

          let status: AppointmentStatus = 'SCHEDULED';
          const r = rand();
          if (offset < 0) status = r < 0.1 ? 'CANCELLED' : r < 0.2 ? 'NO_SHOW' : 'ATTENDED';
          else if (r < 0.06) status = 'CANCELLED';
          const cancelled = status === 'CANCELLED';
          await prisma.appointment.create({
            data: {
              patientId: patient.id,
              doctorId: doctor.id,
              clinicId: clinic.id,
              startsAt: new Date(s),
              endsAt: new Date(e),
              status,
              reason: pickOne(reasons),
              cancelReason: cancelled ? pickOne(cancelReasons) : null,
              cancelledAt: cancelled ? new Date(s - 86400000) : null,
              cancelledById: cancelled ? admin.id : null,
              createdById: admin.id,
              source: 'seed',
              events: { create: [{ type: 'CREATED', byId: admin.id, at: new Date(s - 3 * 86400000), data: { clinic: clinic.name, doctor: doctor.fullName } }] },
            },
          });
          created++;
        }
      }
    }
  }

  // Un feriado de ejemplo y dos pacientes en lista de espera
  await prisma.clinicClosure.create({ data: { clinicId: sur.id, date: new Date(`${today.plus({ days: 20 }).toISODate()}T00:00:00Z`), reason: 'Fumigación programada' } });
  await prisma.waitlistEntry.createMany({
    data: [
      { patientId: patients[1].id, clinicId: centro.id, doctorId: salazar.id, preference: 'Mañanas', createdById: admin.id },
      { patientId: patients[2].id, clinicId: sur.id, preference: 'Cualquier hora', createdById: admin.id },
    ],
  });

  console.log(`Seed listo: 3 clínicas, ${doctors.length} médicos, ${users.length} usuarios, ${patients.length} pacientes, ${created} citas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
