import { Injectable } from '@nestjs/common';
import { Prisma, type Patient } from '@prisma/client';
import {
  ErrorCodes,
  normalizeForSearch,
  type DuplicateCandidate,
  type DuplicateCheckInput,
  type MergePatientsInput,
  type Paginated,
  type PatientCreate,
  type PatientSearchQuery,
  type PatientView,
  type SessionUser,
} from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import { toPatientView } from '../../common/utils/views';
import type { RequestMeta } from '../../common/decorators/auth.decorators';

/** Puntaje desde el cual se pide confirmar que no es la misma persona. */
const DUPLICATE_THRESHOLD = 0.6;

function toData(input: PatientCreate) {
  return {
    firstNames: input.firstNames,
    lastNames: input.lastNames,
    nameNormalized: normalizeForSearch(`${input.firstNames} ${input.lastNames}`),
    birthDate: new Date(`${input.birthDate}T00:00:00Z`),
    birthDateEstimated: input.birthDateEstimated,
    sex: input.sex ?? null,
    documentType: input.documentType,
    documentNumber: input.documentNumber ?? null,
    noDocumentReason: input.documentType === 'SIN_DOCUMENTO' ? input.noDocumentReason : null,
    phone: input.phone,
    email: input.email,
    address: input.address,
    contactNote: input.contactNote,
    guardianName: input.guardian?.fullName ?? null,
    guardianRelationship: input.guardian?.relationship ?? null,
    guardianPhone: input.guardian?.phone ?? null,
    guardianDocument: input.guardian?.documentNumber ?? null,
  };
}

/** Antecedentes de la ficha unida: completan los vacíos de la que se conserva y, si ambas dicen algo distinto, se agregan debajo. */
async function mergeMedicalRecords(tx: Prisma.TransactionClient, keepId: string, mergeId: string) {
  const [keep, merged] = await Promise.all([tx.medicalRecord.findUnique({ where: { patientId: keepId } }), tx.medicalRecord.findUnique({ where: { patientId: mergeId } })]);
  if (!merged) return;
  const { patientId: _p, createdAt: _c, updatedAt: _u, ...fields } = merged;
  if (!keep) {
    await tx.medicalRecord.create({ data: { ...fields, patientId: keepId } });
    return;
  }
  const texts = ['allergies', 'chronicConditions', 'medications', 'surgicalHistory', 'familyHistory', 'habits', 'notes'] as const;
  const data: Prisma.MedicalRecordUpdateInput = { bloodType: keep.bloodType ?? merged.bloodType };
  for (const k of texts) {
    const a = keep[k];
    const b = merged[k];
    data[k] = !a ? b : b && b !== a ? `${a}\n${b}` : a;
  }
  await tx.medicalRecord.update({ where: { patientId: keepId }, data });
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Búsqueda tolerante: por nombre aproximado ("maria lopes" encuentra "María López"),
   * número de documento, teléfono (últimos dígitos) o código de paciente (P-00042).
   * Un médico solo encuentra a pacientes que tienen o tuvieron cita con él.
   */
  async search(q: PatientSearchQuery, user: SessionUser): Promise<Paginated<PatientView>> {
    const term = q.q?.trim() ?? '';
    const normalized = normalizeForSearch(term);
    const digits = term.replace(/\D/g, '');
    const code = /^p-?\d+$/i.test(term) ? Number(digits) : -1;

    const conditions: Prisma.Sql[] = [Prisma.sql`p."mergedIntoId" IS NULL`];
    if (user.role === 'MEDICO') {
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "Appointment" a WHERE a."patientId" = p.id AND a."doctorId" = ${user.doctorId}::uuid)`);
    }
    if (term) {
      const ors: Prisma.Sql[] = [];
      if (normalized) {
        ors.push(Prisma.sql`p."nameNormalized" ILIKE ${'%' + normalized + '%'}`);
        ors.push(Prisma.sql`${normalized} <% p."nameNormalized"`);
      }
      if (digits.length >= 5) {
        ors.push(Prisma.sql`p."documentNumber" LIKE ${digits + '%'}`);
        ors.push(Prisma.sql`p."phone" LIKE ${'%' + digits.replace(/^0/, '')}`);
        ors.push(Prisma.sql`p."guardianPhone" LIKE ${'%' + digits.replace(/^0/, '')}`);
      }
      if (/^[a-z0-9]{5,20}$/i.test(term)) ors.push(Prisma.sql`p."documentNumber" = ${term.toUpperCase()}`);
      if (code > 0) ors.push(Prisma.sql`p.code = ${code}`);
      if (!ors.length) return { items: [], total: 0, page: q.page, pageSize: q.pageSize, pageCount: 1 };
      conditions.push(Prisma.sql`(${Prisma.join(ors, ' OR ')})`);
    }
    const where = Prisma.join(conditions, ' AND ');

    const sortColumn = { lastNames: 'lastNames', firstNames: 'firstNames', birthDate: 'birthDate', createdAt: 'createdAt' }[q.sortBy];
    const dir = q.sortDir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const order = term && normalized
      ? Prisma.sql`word_similarity(${normalized}, p."nameNormalized") DESC, p."lastNames" ASC`
      : Prisma.sql`p.${Prisma.raw(`"${sortColumn}"`)} ${dir}, p."firstNames" ASC`;

    const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM "Patient" p WHERE ${where}`;
    const rows = await this.prisma.$queryRaw<Patient[]>`
      SELECT p.* FROM "Patient" p WHERE ${where}
      ORDER BY ${order}
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;

    const total = Number(count);
    return {
      items: rows.map(toPatientView),
      total,
      page: q.page,
      pageSize: q.pageSize,
      pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  async get(id: string, user: SessionUser): Promise<PatientView & { mergedIntoId: string | null }> {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw DomainError.notFound('al paciente');
    await this.assertCanSee(patient.id, user);
    return { ...toPatientView(patient), mergedIntoId: patient.mergedIntoId };
  }

  /**
   * ¿Es el "Juan Pérez" de hoy el mismo de hace un mes? Se compara documento, nombre aproximado,
   * fecha de nacimiento y teléfono. El sistema no decide solo: muestra candidatos y la persona confirma.
   */
  async findDuplicates(input: DuplicateCheckInput, excludeId?: string): Promise<DuplicateCandidate[]> {
    const name = normalizeForSearch(`${input.firstNames} ${input.lastNames}`);
    if (name.length < 3) return [];
    const birth = input.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) ? input.birthDate : null;
    const doc = input.documentNumber?.replace(/[\s.-]/g, '').toUpperCase() || null;
    const phoneTail = input.phone?.replace(/\D/g, '').slice(-8) || null;

    const rows = await this.prisma.$queryRaw<(Patient & { sim: number })[]>`
      SELECT p.*, similarity(p."nameNormalized", ${name})::float AS sim
      FROM "Patient" p
      WHERE p."mergedIntoId" IS NULL
        AND (${excludeId ?? null}::uuid IS NULL OR p.id <> ${excludeId ?? null}::uuid)
        AND (
          p."nameNormalized" % ${name}
          OR (${doc}::text IS NOT NULL AND p."documentNumber" = ${doc})
          OR (${phoneTail}::text IS NOT NULL AND length(${phoneTail}) = 8 AND p."phone" LIKE '%' || ${phoneTail})
        )
      ORDER BY sim DESC
      LIMIT 10`;

    const candidates = rows.map((p) => {
      const reasons: string[] = [];
      let score = p.sim * 0.5;
      if (p.sim > 0.6) reasons.push('Nombre muy parecido');
      if (doc && p.documentNumber === doc) {
        score += 1;
        reasons.push('Mismo número de documento');
      }
      if (birth && p.birthDate.toISOString().slice(0, 10) === birth) {
        score += 0.35;
        reasons.push('Misma fecha de nacimiento');
      }
      if (phoneTail && phoneTail.length === 8 && p.phone?.endsWith(phoneTail)) {
        score += 0.3;
        reasons.push('Mismo teléfono');
      }
      return { patient: toPatientView(p), score: Math.min(1, Number(score.toFixed(2))), reasons };
    });
    return candidates.filter((c) => c.score >= 0.3).sort((a, b) => b.score - a.score);
  }

  async create(input: PatientCreate, actor: SessionUser, meta: RequestMeta): Promise<PatientView> {
    await this.guardAgainstDuplicates(input, undefined);
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({ data: { ...toData(input), createdById: actor.id } });
      const view = toPatientView(patient);
      await this.audit.log(
        { userId: actor.id, action: 'CREATE', entity: 'Patient', entityId: patient.id, summary: `Registró al paciente ${view.fullName} (${view.code})`, after: view, meta },
        tx,
      );
      return view;
    });
  }

  async update(id: string, input: PatientCreate, actor: SessionUser, meta: RequestMeta): Promise<PatientView> {
    const before = await this.prisma.patient.findUnique({ where: { id } });
    if (!before) throw DomainError.notFound('al paciente');
    if (before.mergedIntoId) throw DomainError.validation('Este registro fue unido a otro paciente; edite el paciente principal.');
    await this.assertCanSee(id, actor);
    await this.guardAgainstDuplicates(input, id);

    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.update({ where: { id }, data: toData(input) });
      const view = toPatientView(patient);
      await this.audit.log(
        { userId: actor.id, action: 'UPDATE', entity: 'Patient', entityId: id, summary: `Editó los datos de ${view.fullName}`, before: toPatientView(before), after: view, meta },
        tx,
      );
      return view;
    });
  }

  /** Une dos fichas de la misma persona: las citas pasan a la ficha que se conserva y la otra queda marcada (no se borra). */
  async merge(input: MergePatientsInput, actor: SessionUser, meta: RequestMeta) {
    if (input.keepId === input.mergeId) throw DomainError.validation('Elija dos pacientes distintos.');
    const [keep, merge] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: input.keepId } }),
      this.prisma.patient.findUnique({ where: { id: input.mergeId } }),
    ]);
    if (!keep || !merge) throw DomainError.notFound('uno de los pacientes');
    if (keep.mergedIntoId || merge.mergedIntoId) throw DomainError.validation('Uno de los pacientes ya fue unido antes.');

    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.appointment.updateMany({ where: { patientId: merge.id }, data: { patientId: keep.id } });
      await tx.waitlistEntry.updateMany({ where: { patientId: merge.id }, data: { patientId: keep.id } });
      await tx.consultation.updateMany({ where: { patientId: merge.id }, data: { patientId: keep.id } });
      await tx.medicalAttachment.updateMany({ where: { patientId: merge.id }, data: { patientId: keep.id } });
      await mergeMedicalRecords(tx, keep.id, merge.id);
      await tx.patient.update({ where: { id: merge.id }, data: { mergedIntoId: keep.id } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'MERGE',
          entity: 'Patient',
          entityId: keep.id,
          summary: `Unió la ficha ${merge.firstNames} ${merge.lastNames} a ${keep.firstNames} ${keep.lastNames} (${moved.count} citas movidas)`,
          before: { kept: toPatientView(keep), merged: toPatientView(merge) },
          meta,
        },
        tx,
      );
      return { keptId: keep.id, movedAppointments: moved.count };
    });
  }

  private async guardAgainstDuplicates(input: PatientCreate, excludeId: string | undefined) {
    if (input.documentNumber) {
      const sameDoc = await this.prisma.patient.findFirst({
        where: { documentType: input.documentType, documentNumber: input.documentNumber, mergedIntoId: null, NOT: excludeId ? { id: excludeId } : undefined },
      });
      if (sameDoc) {
        throw DomainError.conflict(
          ErrorCodes.POSSIBLE_DUPLICATE,
          `Ya existe un paciente con ese documento: ${sameDoc.firstNames} ${sameDoc.lastNames}. Use esa ficha en lugar de crear otra.`,
          { documentNumber: 'Este documento ya está registrado.' },
          { candidates: [{ patient: toPatientView(sameDoc), score: 1, reasons: ['Mismo número de documento'] }], blocking: true },
        );
      }
    }
    if (input.confirmNotDuplicate) return;
    const candidates = (await this.findDuplicates({ ...input, birthDate: input.birthDate }, excludeId)).filter((c) => c.score >= DUPLICATE_THRESHOLD);
    if (candidates.length) {
      throw DomainError.conflict(
        ErrorCodes.POSSIBLE_DUPLICATE,
        'Encontramos pacientes muy parecidos. Revise si es alguno de ellos antes de crear uno nuevo.',
        undefined,
        { candidates, blocking: false },
      );
    }
  }

  /** Un médico solo ve a pacientes que tienen o tuvieron cita con él. */
  async assertCanSee(patientId: string, user: SessionUser) {
    if (user.role !== 'MEDICO') return;
    const has = await this.prisma.appointment.count({ where: { patientId, doctorId: user.doctorId ?? undefined } });
    if (!has) throw DomainError.forbidden('Solo puede ver pacientes que tienen cita con usted.');
  }
}
