import { Injectable } from '@nestjs/common';
import type { Clinic, Doctor, DoctorAssignment } from '@prisma/client';
import { DoctorCreateSchema, type DoctorCreateInput, type DoctorUpdateInput, type DoctorView, type SessionUser } from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import { fromZod } from '../../common/filters/all-exceptions.filter';
import type { RequestMeta } from '../../common/decorators/auth.decorators';

type DoctorFull = Doctor & { assignments: (DoctorAssignment & { clinic: Clinic })[] };

export function toDoctorView(d: DoctorFull): DoctorView {
  return {
    id: d.id,
    fullName: d.fullName,
    specialty: d.specialty,
    phone: d.phone,
    active: d.active,
    assignments: d.assignments
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
      .map((a) => ({ id: a.id, clinicId: a.clinicId, clinicName: a.clinic.name, weekday: a.weekday, startTime: a.startTime, endTime: a.endTime })),
  };
}

const include = { assignments: { include: { clinic: true } } } as const;

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(clinicId?: string): Promise<DoctorView[]> {
    const doctors = await this.prisma.doctor.findMany({
      where: clinicId ? { assignments: { some: { clinicId } } } : undefined,
      include,
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
    return doctors.map(toDoctorView);
  }

  async get(id: string): Promise<DoctorView> {
    const doctor = await this.prisma.doctor.findUnique({ where: { id }, include });
    if (!doctor) throw DomainError.notFound('al médico');
    return toDoctorView(doctor);
  }

  async create(input: DoctorCreateInput, actor: SessionUser, meta: RequestMeta) {
    await this.assertClinicsExist(input.assignments.map((a) => a.clinicId));
    return this.prisma.$transaction(async (tx) => {
      const doctor = await tx.doctor.create({
        data: { fullName: input.fullName, specialty: input.specialty, phone: input.phone, assignments: { create: input.assignments } },
        include,
      });
      const view = toDoctorView(doctor);
      await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Doctor', entityId: doctor.id, summary: `Registró al médico ${doctor.fullName}`, after: view, meta }, tx);
      return view;
    });
  }

  async update(id: string, input: DoctorUpdateInput, actor: SessionUser, meta: RequestMeta) {
    const before = await this.get(id);
    // Se revalida el horario completo resultante (p. ej. que no quede en dos clínicas a la vez).
    const merged = DoctorCreateSchema.safeParse({
      fullName: input.fullName ?? before.fullName,
      specialty: input.specialty ?? before.specialty,
      phone: input.phone === undefined ? before.phone : input.phone,
      assignments: input.assignments ?? before.assignments.map(({ clinicId, weekday, startTime, endTime }) => ({ clinicId, weekday, startTime, endTime })),
    });
    if (!merged.success) {
      const err = fromZod(merged.error);
      throw DomainError.validation(err.message, err.fields);
    }
    await this.assertClinicsExist(merged.data.assignments.map((a) => a.clinicId));

    return this.prisma.$transaction(async (tx) => {
      if (input.assignments) {
        await tx.doctorAssignment.deleteMany({ where: { doctorId: id } });
        await tx.doctorAssignment.createMany({ data: merged.data.assignments.map((a) => ({ ...a, doctorId: id })) });
      }
      const doctor = await tx.doctor.update({
        where: { id },
        data: { fullName: merged.data.fullName, specialty: merged.data.specialty, phone: merged.data.phone, active: input.active },
        include,
      });
      const view = toDoctorView(doctor);
      await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'Doctor', entityId: id, summary: `Actualizó al médico ${doctor.fullName}`, before, after: view, meta }, tx);
      return view;
    });
  }

  private async assertClinicsExist(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const found = await this.prisma.clinic.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw DomainError.validation('Una de las clínicas elegidas no existe.');
  }
}
