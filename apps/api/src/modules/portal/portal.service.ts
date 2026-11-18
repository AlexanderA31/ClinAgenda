import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import {
  CANCEL_LINK_HOURS,
  ErrorCodes,
  PORTAL_LIMITS,
  normalizeForSearch,
  type PatientLoginInput,
  type PatientRegister,
  type PortalAppointment,
  type PortalBookInput,
  type PortalMe,
  type PortalSlot,
} from '@clinagenda/schemas';
import type { Appointment, Clinic, Doctor } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import type { RequestMeta } from '../../common/decorators/auth.decorators';
import { appointmentCode, patientCode } from '../../common/utils/views';
import { formatLocal } from '../../common/utils/time';
import { receiptPdf } from '../../common/utils/receipt-pdf';
import { SchedulingService } from '../appointments/scheduling.service';
import { PublicService } from '../public/public.service';
import type { PatientSession } from './patient-auth.guard';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type ApptFull = Appointment & { doctor: Doctor; clinic: Clinic };

/**
 * Portal del paciente. Reglas para que agendar en línea no desordene la agenda:
 *  - Solo adultos con cédula o pasaporte (los demás siguen por teléfono).
 *  - Si ya hay una ficha con ese documento, se vincula solo si coinciden fecha de nacimiento y celular;
 *    si no, se pide llamar a la clínica (nadie puede tomar la ficha de otra persona sabiendo su cédula).
 *  - Se agenda con PORTAL_LIMITS.minHoursAhead de anticipación, hasta maxDaysAhead días, y máximo maxUpcoming citas a la vez.
 *  - Las mismas reglas de la agenda (horario, choques, lock por médico) vía SchedulingService.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly scheduling: SchedulingService,
    private readonly publicLinks: PublicService,
  ) {}

  async register(input: PatientRegister, meta: RequestMeta): Promise<{ token: string; me: PortalMe }> {
    if (await this.prisma.patientAccount.findUnique({ where: { login: input.documentNumber } })) {
      throw DomainError.validation('Ya existe una cuenta con ese documento. Ingrese con su contraseña o pida ayuda en su clínica.', { documentNumber: 'Ya tiene cuenta.' });
    }
    const existing = await this.prisma.patient.findFirst({ where: { documentNumber: input.documentNumber, mergedIntoId: null } });
    if (existing) {
      const sameBirth = existing.birthDate.toISOString().slice(0, 10) === input.birthDate;
      const samePhone = !!existing.phone && existing.phone === input.phone;
      if (!sameBirth || !samePhone) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          ErrorCodes.CONFLICT,
          'Ya tenemos una ficha con ese documento, pero la fecha de nacimiento o el celular no coinciden. Llame a su clínica para actualizar sus datos y crear su cuenta.',
        );
      }
    }

    const passwordHash = await argon2.hash(input.password);
    const account = await this.prisma.$transaction(async (tx) => {
      const patient =
        existing ??
        (await tx.patient.create({
          data: {
            firstNames: input.firstNames,
            lastNames: input.lastNames,
            nameNormalized: normalizeForSearch(`${input.firstNames} ${input.lastNames}`),
            birthDate: new Date(`${input.birthDate}T00:00:00Z`),
            documentType: input.documentType,
            documentNumber: input.documentNumber,
            phone: input.phone,
            email: input.email ?? null,
            contactNote: 'Se registró en línea.',
          },
        }));
      const acc = await tx.patientAccount.create({ data: { patientId: patient.id, login: input.documentNumber, passwordHash, lastLoginAt: new Date() } });
      await this.audit.log(
        {
          userId: null,
          action: 'PORTAL_REGISTER',
          entity: 'Patient',
          entityId: patient.id,
          summary: existing ? `El paciente ${patientCode(patient.code)} creó su cuenta en línea` : `Paciente nuevo ${patientCode(patient.code)} registrado en línea`,
          meta,
        },
        tx,
      );
      return acc;
    });
    return { token: await this.sign(account.id, 0), me: await this.me({ accountId: account.id, patientId: account.patientId }) };
  }

  async login(input: PatientLoginInput, meta: RequestMeta): Promise<{ token: string; me: PortalMe }> {
    const login = input.documentNumber.replace(/[\s-]/g, '').toUpperCase();
    const account = await this.prisma.patientAccount.findUnique({ where: { login } });
    const invalid = DomainError.validation('Documento o contraseña incorrectos.');
    if (!account) {
      await argon2.hash(input.password); // mismo tiempo de respuesta exista o no la cuenta
      throw invalid;
    }
    if (account.lockedUntil && account.lockedUntil > new Date()) {
      const minutes = Math.ceil((account.lockedUntil.getTime() - Date.now()) / 60000);
      throw new DomainError(HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.TOO_MANY_ATTEMPTS, `Por seguridad, su cuenta quedó bloqueada por demasiados intentos. Intente en ${minutes} minuto(s).`);
    }
    if (!(await argon2.verify(account.passwordHash, input.password))) {
      const failed = account.failedAttempts + 1;
      const lock = failed >= MAX_FAILED_ATTEMPTS;
      await this.prisma.patientAccount.update({
        where: { id: account.id },
        data: { failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null },
      });
      await this.audit.log({ userId: null, action: 'PORTAL_LOGIN_FAILED', entity: 'Patient', entityId: account.patientId, summary: `Contraseña incorrecta en el portal (${failed})`, meta });
      throw invalid;
    }
    await this.prisma.patientAccount.update({ where: { id: account.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
    return { token: await this.sign(account.id, account.tokenVersion), me: await this.me({ accountId: account.id, patientId: account.patientId }) };
  }

  async me(session: PatientSession): Promise<PortalMe> {
    const p = await this.prisma.patient.findUniqueOrThrow({ where: { id: session.patientId } });
    return {
      firstNames: p.firstNames,
      lastNames: p.lastNames,
      documentType: p.documentType === 'PASAPORTE' ? 'PASAPORTE' : 'CEDULA',
      documentNumber: p.documentNumber ?? '',
      phone: p.phone,
      email: p.email,
      patientCode: patientCode(p.code),
    };
  }

  /** Solo horarios libres: nunca datos de otros pacientes. */
  async availability(clinicId: string, date: string, doctorId?: string): Promise<{ closed: string | null; slots: PortalSlot[] }> {
    const { closed, slots } = await this.scheduling.availability(clinicId, date, doctorId);
    const earliest = Date.now() + PORTAL_LIMITS.minHoursAhead * 3600_000;
    const doctors = await this.prisma.doctor.findMany({ where: { id: { in: [...new Set(slots.map((s) => s.doctorId))] } }, select: { id: true, specialty: true } });
    const specialty = new Map(doctors.map((d) => [d.id, d.specialty]));
    return {
      closed,
      slots: slots
        .filter((s) => s.available && new Date(s.startsAt).getTime() >= earliest)
        .map((s) => ({ doctorId: s.doctorId, doctorName: s.doctorName, specialty: specialty.get(s.doctorId) ?? '', startsAt: s.startsAt, label: s.label })),
    };
  }

  async book(session: PatientSession, input: PortalBookInput, meta: RequestMeta): Promise<PortalAppointment> {
    const startsAt = new Date(input.startsAt);
    if (startsAt.getTime() < Date.now() + PORTAL_LIMITS.minHoursAhead * 3600_000) {
      throw DomainError.validation(`En línea se agenda con al menos ${PORTAL_LIMITS.minHoursAhead} horas de anticipación. Para antes, llame a la clínica.`);
    }
    if (startsAt.getTime() > Date.now() + PORTAL_LIMITS.maxDaysAhead * 86400_000) {
      throw DomainError.validation(`En línea se agenda hasta ${PORTAL_LIMITS.maxDaysAhead} días adelante.`);
    }
    const upcoming = await this.prisma.appointment.count({ where: { patientId: session.patientId, status: { in: ['SCHEDULED', 'REQUESTED'] }, startsAt: { gt: new Date() } } });
    if (upcoming >= PORTAL_LIMITS.maxUpcoming) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        ErrorCodes.CONFLICT,
        `Ya tiene ${upcoming} citas por venir, el máximo en línea. Si necesita otra, cancele una o llame a la clínica.`,
      );
    }

    const [patient, doctor, clinic] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({ where: { id: session.patientId } }),
      this.prisma.doctor.findUnique({ where: { id: input.doctorId } }),
      this.prisma.clinic.findUnique({ where: { id: input.clinicId }, include: { schedules: true } }),
    ]);
    if (!doctor || !doctor.active) throw DomainError.notFound('al médico');
    if (!clinic || !clinic.active) throw DomainError.notFound('la clínica');
    const endsAt = new Date(startsAt.getTime() + clinic.slotMinutes * 60000);

    const created = await this.prisma.$transaction(async (tx) => {
      await this.scheduling.assertBookable({ clinic, doctor, patientId: patient.id, startsAt, endsAt }, tx);
      const appt = await tx.appointment.create({
        // Queda como solicitud: la clínica la acepta desde su agenda.
        data: { patientId: patient.id, doctorId: doctor.id, clinicId: clinic.id, startsAt, endsAt, reason: input.reason ?? null, source: 'web', status: 'REQUESTED' },
        include: { doctor: true, clinic: true },
      });
      await tx.appointmentEvent.create({ data: { appointmentId: appt.id, type: 'CREATED', data: { startsAt, clinic: clinic.name, doctor: doctor.fullName, via: 'web' } } });
      await this.audit.log(
        {
          userId: null,
          action: 'CREATE_BY_PATIENT',
          entity: 'Appointment',
          entityId: appt.id,
          summary: `El paciente ${patientCode(patient.code)} agendó en línea ${appointmentCode(appt.code)} con ${doctor.fullName}, ${clinic.name}, ${formatLocal(startsAt, clinic.timezone)}`,
          meta,
        },
        tx,
      );
      return appt;
    });
    return this.toView(created);
  }

  async appointments(session: PatientSession): Promise<PortalAppointment[]> {
    const list = await this.prisma.appointment.findMany({
      where: { patientId: session.patientId },
      include: { doctor: true, clinic: true },
      orderBy: { startsAt: 'desc' },
      take: 50,
    });
    return list.map((a) => this.toView(a));
  }

  async cancel(session: PatientSession, id: string, meta: RequestMeta): Promise<PortalAppointment> {
    const appt = await this.prisma.appointment.findFirst({ where: { id, patientId: session.patientId } });
    if (!appt) throw DomainError.notFound('esa cita');
    await this.publicLinks.cancel(appt.publicToken, meta);
    return this.toView(await this.prisma.appointment.findUniqueOrThrow({ where: { id }, include: { doctor: true, clinic: true } }));
  }

  /** Comprobante en PDF de una cita propia. */
  async receipt(session: PatientSession, id: string): Promise<{ filename: string; pdf: Buffer }> {
    const a = await this.prisma.appointment.findFirst({ where: { id, patientId: session.patientId }, include: { patient: true, doctor: true, clinic: true } });
    if (!a) throw DomainError.notFound('esa cita');
    const code = appointmentCode(a.code);
    const pdf = await receiptPdf({
      code,
      status: a.status,
      startsAt: a.startsAt,
      timezone: a.clinic.timezone,
      patientName: `${a.patient.firstNames} ${a.patient.lastNames}`,
      doctorName: a.doctor.fullName,
      specialty: a.doctor.specialty,
      clinic: { name: a.clinic.name, address: a.clinic.address, phone: a.clinic.phone },
      publicToken: a.publicToken,
    });
    return { filename: `comprobante-${code}.pdf`, pdf };
  }

  private sign(accountId: string, version: number) {
    return this.jwt.signAsync({ sub: accountId, kind: 'patient', v: version });
  }

  private toView(a: ApptFull): PortalAppointment {
    return {
      id: a.id,
      code: appointmentCode(a.code),
      status: a.status,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      doctorName: a.doctor.fullName,
      specialty: a.doctor.specialty,
      clinic: { id: a.clinic.id, name: a.clinic.name, address: a.clinic.address, phone: a.clinic.phone },
      reason: a.reason,
      canCancel: (a.status === 'SCHEDULED' || a.status === 'REQUESTED') && Date.now() < a.startsAt.getTime() - CANCEL_LINK_HOURS * 3600_000,
      rejectedNote: a.cancelReason === 'SOLICITUD_RECHAZADA' ? (a.cancelNote ?? '') : null,
      link: `/c/${a.publicToken}`,
    };
  }
}
