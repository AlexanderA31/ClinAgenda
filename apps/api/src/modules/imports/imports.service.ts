import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DoctorCreateSchema,
  PatientCreateSchema,
  checkCedula,
  normalizeForSearch,
  type ImportKind,
  type ImportReport,
  type ImportRowResult,
  type SessionUser,
} from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import { localToUtc, hhmmToMinutes } from '../../common/utils/time';
import type { RequestMeta } from '../../common/decorators/auth.decorators';
import { parseFlexibleDate, parseFlexibleTime, pick, readCsv } from './csv';

const MAX_ROWS = 5000;

/**
 * Importa los datos de prueba "como los entregaría una clínica real". Cada fila termina en uno de cuatro estados:
 *  IMPORTED  – entró tal cual
 *  FIXED     – entró con una corrección automática segura, que se informa (p. ej. cédula a la que Excel le quitó el 0)
 *  DUPLICATE – ya existía; no se crea otra vez
 *  REJECTED  – no se puede adivinar sin inventar datos; se explica qué falta para que una persona lo complete
 * Por defecto es una vista previa (dryRun): no guarda nada hasta que la persona confirma.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async run(kind: ImportKind, file: Express.Multer.File, dryRun: boolean, user: SessionUser, meta: RequestMeta): Promise<ImportReport> {
    if (!file) throw DomainError.validation('Adjunte un archivo CSV.');
    const rows = readCsv(file.buffer);
    if (!rows.length) throw DomainError.validation('El archivo está vacío o no tiene encabezados en la primera fila.');
    if (rows.length > MAX_ROWS) throw DomainError.validation(`El archivo tiene ${rows.length} filas; el máximo por importación es ${MAX_ROWS}. Divídalo en partes.`);

    const results =
      kind === 'patients' ? await this.patients(rows, dryRun, user) : kind === 'doctors' ? await this.doctors(rows, dryRun) : await this.appointments(rows, dryRun, user);

    const count = (s: ImportRowResult['status']) => results.filter((r) => r.status === s).length;
    const summary = { total: results.length, imported: count('IMPORTED'), fixed: count('FIXED'), rejected: count('REJECTED'), duplicates: count('DUPLICATE') };
    const job = await this.prisma.importJob.create({
      data: { kind, fileName: file.originalname.slice(0, 200), dryRun, summary: summary as Prisma.InputJsonValue, createdById: user.id },
    });
    if (!dryRun) {
      await this.audit.log({
        userId: user.id,
        action: 'IMPORT',
        entity: 'ImportJob',
        entityId: job.id,
        summary: `Importó ${kind} desde ${file.originalname}: ${summary.imported + summary.fixed} cargados, ${summary.rejected} rechazados, ${summary.duplicates} duplicados`,
        after: summary,
        meta,
      });
    }
    return { id: job.id, kind, fileName: file.originalname, dryRun, ...summary, rows: results, createdAt: job.createdAt.toISOString() };
  }

  private async patients(rows: Record<string, string>[], dryRun: boolean, user: SessionUser): Promise<ImportRowResult[]> {
    const seen = new Map<string, number>();
    const results: ImportRowResult[] = [];

    for (const [i, row] of rows.entries()) {
      const rowNum = i + 2; // +1 por encabezado, +1 porque Excel cuenta desde 1
      const fixes: string[] = [];
      let firstNames = pick(row, 'nombres', 'nombre', 'first_name', 'primer_nombre');
      let lastNames = pick(row, 'apellidos', 'apellido', 'last_name');
      const full = pick(row, 'nombre_completo', 'paciente', 'full_name');
      if ((!firstNames || !lastNames) && full) {
        const parts = full.split(/\s+/);
        if (parts.length >= 2) {
          // "Juan Carlos Pérez Mora": asumimos los dos últimos como apellidos (convención ecuatoriana).
          const split = parts.length >= 4 ? parts.length - 2 : parts.length - 1;
          firstNames = parts.slice(0, split).join(' ');
          lastNames = parts.slice(split).join(' ');
          fixes.push('Se separó el nombre completo en nombres y apellidos; revise que esté bien.');
        }
      }

      let doc = pick(row, 'cedula', 'documento', 'identificacion', 'ci', 'pasaporte', 'dni').replace(/[\s.-]/g, '');
      let documentType: 'CEDULA' | 'PASAPORTE' | 'SIN_DOCUMENTO' = 'SIN_DOCUMENTO';
      let noDocumentReason: string | null = null;
      if (/^\d{9}$/.test(doc) && !checkCedula('0' + doc)) {
        doc = '0' + doc;
        fixes.push('A la cédula le faltaba el 0 inicial (Excel lo suele quitar); se agregó.');
      }
      if (/^\d+$/.test(doc)) documentType = 'CEDULA';
      else if (doc) documentType = 'PASAPORTE';
      else noDocumentReason = 'Importado sin documento: pedirlo en la próxima visita';
      if (doc && /^0+$/.test(doc)) {
        results.push({ row: rowNum, status: 'REJECTED', messages: [`La cédula "${doc}" no es real (solo ceros). Corrija el dato en el archivo.`] });
        continue;
      }

      let phone = pick(row, 'telefono', 'celular', 'movil', 'phone', 'telefono_celular');
      if (/^9\d{8}$/.test(phone.replace(/\D/g, ''))) {
        phone = '0' + phone.replace(/\D/g, '');
        fixes.push('Al celular le faltaba el 0 inicial; se agregó.');
      }
      const birthRaw = pick(row, 'fecha_nacimiento', 'nacimiento', 'fecha_de_nacimiento', 'birth_date', 'fnac');
      const birth = parseFlexibleDate(birthRaw);
      if (birth.fixed) fixes.push(`Fecha de nacimiento convertida de "${birthRaw}" a ${birth.value}.`);

      const email = pick(row, 'correo', 'email', 'correo_electronico', 'mail');
      const guardianName = pick(row, 'representante', 'responsable', 'tutor');
      const candidate = {
        firstNames,
        lastNames,
        birthDate: birth.value ?? birthRaw,
        documentType,
        documentNumber: doc || null,
        noDocumentReason,
        phone: phone || null,
        email: email || null,
        address: pick(row, 'direccion', 'domicilio') || null,
        guardian: guardianName ? { fullName: guardianName, relationship: pick(row, 'parentesco') || 'Representante', phone: pick(row, 'telefono_representante') || null } : null,
        contactNote: null as string | null,
        confirmNotDuplicate: true,
      };

      let parsed = PatientCreateSchema.safeParse(candidate);
      // Un correo mal escrito no debe impedir registrar al paciente: se descarta y se informa.
      if (!parsed.success && parsed.error.issues.some((x) => x.path[0] === 'email')) {
        fixes.push(`El correo "${email}" no es válido y se dejó vacío.`);
        candidate.email = null;
        parsed = PatientCreateSchema.safeParse(candidate);
      }
      if (!parsed.success && parsed.error.issues.some((x) => x.path[0] === 'phone') && candidate.phone) {
        fixes.push(`El teléfono "${candidate.phone}" no es válido y se dejó vacío; confírmelo con el paciente.`);
        candidate.phone = null;
        parsed = PatientCreateSchema.safeParse(candidate);
      }
      if (!parsed.success && parsed.error.issues.some((x) => x.path[0] === 'contactNote')) {
        candidate.contactNote = 'Importado sin datos de contacto: completar en la próxima visita';
        fixes.push('No tiene teléfono ni correo: se marcó para completar en la próxima visita.');
        parsed = PatientCreateSchema.safeParse(candidate);
      }
      if (!parsed.success) {
        results.push({ row: rowNum, status: 'REJECTED', messages: parsed.error.issues.map((x) => `${fieldLabel(String(x.path[0]))}: ${x.message}`), data: row });
        continue;
      }

      const p = parsed.data;
      const key = p.documentNumber ?? `${normalizeForSearch(p.firstNames + ' ' + p.lastNames)}|${p.birthDate}`;
      if (seen.has(key)) {
        results.push({ row: rowNum, status: 'DUPLICATE', messages: [`Repetido dentro del mismo archivo (igual a la fila ${seen.get(key)}).`] });
        continue;
      }
      seen.set(key, rowNum);

      const existing = await this.prisma.patient.findFirst({
        where: p.documentNumber
          ? { documentNumber: p.documentNumber, mergedIntoId: null }
          : { nameNormalized: normalizeForSearch(`${p.firstNames} ${p.lastNames}`), birthDate: new Date(`${p.birthDate}T00:00:00Z`), mergedIntoId: null },
      });
      if (existing) {
        results.push({ row: rowNum, status: 'DUPLICATE', messages: [`Ya existe: ${existing.firstNames} ${existing.lastNames}. No se creó de nuevo.`] });
        continue;
      }

      if (!dryRun) {
        await this.prisma.patient.create({
          data: {
            firstNames: p.firstNames,
            lastNames: p.lastNames,
            nameNormalized: normalizeForSearch(`${p.firstNames} ${p.lastNames}`),
            birthDate: new Date(`${p.birthDate}T00:00:00Z`),
            documentType: p.documentType,
            documentNumber: p.documentNumber ?? null,
            noDocumentReason: p.noDocumentReason,
            phone: p.phone,
            email: p.email,
            address: p.address,
            contactNote: p.contactNote,
            guardianName: p.guardian?.fullName ?? null,
            guardianRelationship: p.guardian?.relationship ?? null,
            guardianPhone: p.guardian?.phone ?? null,
            createdById: user.id,
          },
        });
      }
      results.push({ row: rowNum, status: fixes.length ? 'FIXED' : 'IMPORTED', messages: fixes, data: { nombre: `${p.firstNames} ${p.lastNames}`, documento: p.documentNumber } });
    }
    return results;
  }

  private async doctors(rows: Record<string, string>[], dryRun: boolean): Promise<ImportRowResult[]> {
    const results: ImportRowResult[] = [];
    for (const [i, row] of rows.entries()) {
      const parsed = DoctorCreateSchema.safeParse({
        fullName: pick(row, 'nombre', 'medico', 'doctor', 'nombre_completo').replace(/^(dr|dra)\.?\s+/i, ''),
        specialty: pick(row, 'especialidad', 'specialty') || 'Medicina general',
        phone: pick(row, 'telefono', 'celular') || null,
        assignments: [],
      });
      if (!parsed.success) {
        results.push({ row: i + 2, status: 'REJECTED', messages: parsed.error.issues.map((x) => x.message), data: row });
        continue;
      }
      const exists = await this.prisma.doctor.findFirst({ where: { fullName: { equals: parsed.data.fullName, mode: 'insensitive' } } });
      if (exists) {
        results.push({ row: i + 2, status: 'DUPLICATE', messages: [`${exists.fullName} ya está registrado.`] });
        continue;
      }
      if (!dryRun) await this.prisma.doctor.create({ data: { fullName: parsed.data.fullName, specialty: parsed.data.specialty, phone: parsed.data.phone } });
      results.push({ row: i + 2, status: 'IMPORTED', messages: ['Recuerde asignarle horario y clínica.'], data: { nombre: parsed.data.fullName } });
    }
    return results;
  }

  /** Citas históricas: no se aplica la regla de "no agendar en el pasado", pero sí la de no cruzar horarios. */
  private async appointments(rows: Record<string, string>[], dryRun: boolean, user: SessionUser): Promise<ImportRowResult[]> {
    const [clinics, doctors] = await Promise.all([this.prisma.clinic.findMany(), this.prisma.doctor.findMany()]);
    const findClinic = (name: string) => {
      const n = normalizeForSearch(name).replace(/^clinica /, '');
      return clinics.find((c) => normalizeForSearch(c.name).replace(/^clinica /, '') === n);
    };
    const findDoctor = (name: string) => {
      const n = normalizeForSearch(name).replace(/^(dr|dra) /, '');
      return doctors.find((d) => normalizeForSearch(d.fullName) === n) ?? doctors.find((d) => normalizeForSearch(d.fullName).includes(n) && n.length >= 5);
    };

    const results: ImportRowResult[] = [];
    for (const [i, row] of rows.entries()) {
      const rowNum = i + 2;
      const problems: string[] = [];
      const date = parseFlexibleDate(pick(row, 'fecha', 'dia', 'date')).value;
      const time = parseFlexibleTime(pick(row, 'hora', 'time', 'hora_inicio'));
      const clinic = findClinic(pick(row, 'clinica', 'sede', 'clinic'));
      const doctor = findDoctor(pick(row, 'medico', 'doctor', 'doctora'));
      const docNum = pick(row, 'cedula', 'documento', 'cedula_paciente').replace(/[\s.-]/g, '');
      const patientName = pick(row, 'paciente', 'nombre_paciente', 'nombre');

      if (!date) problems.push('Fecha vacía o con formato desconocido.');
      if (!time) problems.push('Hora vacía o con formato desconocido.');
      if (!clinic) problems.push(`No se reconoce la clínica "${pick(row, 'clinica', 'sede')}".`);
      if (!doctor) problems.push(`No se reconoce al médico "${pick(row, 'medico', 'doctor')}". Regístrelo primero.`);

      let patient = docNum ? await this.prisma.patient.findFirst({ where: { documentNumber: docNum.length === 9 ? '0' + docNum : docNum, mergedIntoId: null } }) : null;
      if (!patient && patientName) {
        const matches = await this.prisma.patient.findMany({ where: { nameNormalized: normalizeForSearch(patientName), mergedIntoId: null }, take: 2 });
        if (matches.length === 1) patient = matches[0];
        else if (matches.length > 1) problems.push(`Hay varios pacientes llamados "${patientName}"; agregue la cédula para saber cuál es.`);
      }
      if (!patient && !problems.some((p) => p.includes('varios'))) problems.push('No se encontró al paciente. Importe primero el archivo de pacientes.');

      if (problems.length || !date || !time || !clinic || !doctor || !patient) {
        results.push({ row: rowNum, status: 'REJECTED', messages: problems, data: row });
        continue;
      }

      const startsAt = localToUtc(date, hhmmToMinutes(time), clinic.timezone);
      const duration = Number(pick(row, 'duracion', 'minutos')) || clinic.slotMinutes;
      const endsAt = new Date(startsAt.getTime() + duration * 60000);
      const statusRaw = normalizeForSearch(pick(row, 'estado', 'status'));
      const isPast = startsAt.getTime() < Date.now();
      const status = statusRaw.startsWith('cancel') ? 'CANCELLED' : statusRaw.includes('no asist') || statusRaw.includes('falt') ? 'NO_SHOW' : isPast ? 'ATTENDED' : 'SCHEDULED';

      const clash = status === 'CANCELLED' ? null : await this.prisma.appointment.findFirst({
        where: { status: { not: 'CANCELLED' }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, OR: [{ doctorId: doctor.id }, { patientId: patient.id }] },
      });
      if (clash) {
        results.push({ row: rowNum, status: clash.patientId === patient.id && clash.doctorId === doctor.id ? 'DUPLICATE' : 'REJECTED', messages: ['Se cruza con otra cita ya registrada del mismo médico o paciente (las citas cruzadas del cuaderno).'], data: row });
        continue;
      }

      if (!dryRun) {
        try {
          const appt = await this.prisma.appointment.create({
            data: {
              patientId: patient.id,
              doctorId: doctor.id,
              clinicId: clinic.id,
              startsAt,
              endsAt,
              status,
              reason: pick(row, 'motivo', 'razon') || null,
              cancelReason: status === 'CANCELLED' ? 'OTRO' : null,
              cancelNote: status === 'CANCELLED' ? 'Importada como cancelada' : null,
              cancelledAt: status === 'CANCELLED' ? new Date() : null,
              createdById: user.id,
              source: 'import',
            },
          });
          await this.prisma.appointmentEvent.create({ data: { appointmentId: appt.id, type: 'IMPORTED', byId: user.id } });
        } catch {
          results.push({ row: rowNum, status: 'REJECTED', messages: ['Se cruza con otra cita del mismo médico o paciente.'], data: row });
          continue;
        }
      }
      results.push({ row: rowNum, status: 'IMPORTED', messages: [], data: { fecha: date, hora: time, paciente: `${patient.firstNames} ${patient.lastNames}` } });
    }
    return results;
  }
}

function fieldLabel(path: string): string {
  return (
    {
      firstNames: 'Nombres',
      lastNames: 'Apellidos',
      birthDate: 'Fecha de nacimiento',
      documentNumber: 'Documento',
      phone: 'Teléfono',
      email: 'Correo',
      guardian: 'Representante',
      contactNote: 'Contacto',
      noDocumentReason: 'Documento',
    } as Record<string, string>
  )[path] ?? path;
}
