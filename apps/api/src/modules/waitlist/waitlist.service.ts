import { Injectable } from '@nestjs/common';
import type { Clinic, Doctor, Patient, WaitlistEntry } from '@prisma/client';
import { workClinics, worksAt, type SessionUser, type WaitlistCreateInput, type WaitlistEntryView } from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import type { RequestMeta } from '../../common/decorators/auth.decorators';

type Entry = WaitlistEntry & { patient: Patient; clinic: Clinic; doctor: Doctor | null };

function toView(e: Entry): WaitlistEntryView {
  return {
    id: e.id,
    status: e.status,
    preference: e.preference,
    createdAt: e.createdAt.toISOString(),
    patient: { id: e.patient.id, fullName: `${e.patient.firstNames} ${e.patient.lastNames}`, phone: e.patient.phone ?? e.patient.guardianPhone },
    clinic: { id: e.clinic.id, name: e.clinic.name },
    doctor: e.doctor ? { id: e.doctor.id, fullName: e.doctor.fullName } : null,
  };
}

const include = { patient: true, clinic: true, doctor: true } as const;

/** Pacientes que quieren una cita antes. Cuando alguien cancela, la web muestra esta lista para llenar el espacio. */
@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Cada quien ve la lista de espera de sus clínicas (ver workClinics). */
  async list(user: SessionUser, clinicId?: string, doctorId?: string): Promise<WaitlistEntryView[]> {
    const mine = workClinics(user);
    if (mine && clinicId && !mine.includes(clinicId)) throw DomainError.forbidden('Usted no trabaja en esa clínica.');
    const entries = await this.prisma.waitlistEntry.findMany({
      where: { status: 'WAITING', clinicId: clinicId ?? (mine ? { in: mine } : undefined), ...(doctorId ? { OR: [{ doctorId: null }, { doctorId }] } : {}) },
      include,
      orderBy: { createdAt: 'asc' },
    });
    return entries.map(toView);
  }

  async create(input: WaitlistCreateInput, user: SessionUser, meta: RequestMeta) {
    if (!worksAt(user, input.clinicId)) throw DomainError.forbidden('Usted no trabaja en esa clínica.');
    const existing = await this.prisma.waitlistEntry.findFirst({
      where: { patientId: input.patientId, clinicId: input.clinicId, status: 'WAITING', doctorId: input.doctorId ?? null },
      include,
    });
    if (existing) return toView(existing);

    return this.prisma.$transaction(async (tx) => {
      const e = await tx.waitlistEntry.create({
        data: { patientId: input.patientId, clinicId: input.clinicId, doctorId: input.doctorId ?? null, preference: input.preference, createdById: user.id },
        include,
      });
      await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'WaitlistEntry', entityId: e.id, summary: `Puso en lista de espera a ${e.patient.firstNames} ${e.patient.lastNames} (${e.clinic.name})`, meta }, tx);
      return toView(e);
    });
  }

  async remove(id: string, user: SessionUser, meta: RequestMeta) {
    const e = await this.prisma.waitlistEntry.findUnique({ where: { id }, include });
    if (!e) throw DomainError.notFound('la entrada de lista de espera');
    if (!worksAt(user, e.clinicId)) throw DomainError.forbidden('Usted no trabaja en esa clínica.');
    if (e.status !== 'WAITING') return toView(e);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.waitlistEntry.update({ where: { id }, data: { status: 'REMOVED', resolvedAt: new Date() }, include });
      await this.audit.log({ userId: user.id, action: 'REMOVE', entity: 'WaitlistEntry', entityId: id, summary: `Quitó de la lista de espera a ${e.patient.firstNames} ${e.patient.lastNames}`, meta }, tx);
      return toView(updated);
    });
  }
}
