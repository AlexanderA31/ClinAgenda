import type { Appointment, Clinic, Doctor, Patient } from '@prisma/client';
import { ageOn, todayIn, type AppointmentView, type PatientView, type SessionUser } from '@clinagenda/schemas';
import { isoDate } from './time';

export function patientCode(code: number): string {
  return `P-${String(code).padStart(5, '0')}`;
}

export function appointmentCode(code: number): string {
  return `C-${String(code).padStart(6, '0')}`;
}

export function toPatientView(p: Patient): PatientView {
  const birthDate = isoDate(p.birthDate);
  return {
    id: p.id,
    code: patientCode(p.code),
    firstNames: p.firstNames,
    lastNames: p.lastNames,
    fullName: `${p.firstNames} ${p.lastNames}`,
    birthDate,
    birthDateEstimated: p.birthDateEstimated,
    age: ageOn(birthDate, todayIn()),
    sex: p.sex,
    documentType: p.documentType,
    documentNumber: p.documentNumber,
    noDocumentReason: p.noDocumentReason,
    phone: p.phone,
    email: p.email,
    address: p.address,
    contactNote: p.contactNote,
    guardian: p.guardianName
      ? {
          fullName: p.guardianName,
          relationship: p.guardianRelationship ?? '',
          phone: p.guardianPhone,
          documentNumber: p.guardianDocument,
        }
      : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export type AppointmentWithRelations = Appointment & { patient: Patient; doctor: Doctor; clinic: Clinic };

/**
 * La nota clínica solo viaja al médico de esa cita y a la dirección.
 * Recepción ve agenda y datos de contacto, nunca información médica.
 */
export function canSeeClinicalNote(user: SessionUser, appt: Pick<Appointment, 'doctorId'>): boolean {
  return user.role === 'ADMIN' || (user.role === 'MEDICO' && user.doctorId === appt.doctorId);
}

export function toAppointmentView(
  a: AppointmentWithRelations,
  user: SessionUser,
  names: Map<string, string> = new Map(),
): AppointmentView {
  const birthDate = isoDate(a.patient.birthDate);
  const view: AppointmentView = {
    id: a.id,
    code: appointmentCode(a.code),
    status: a.status,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    reason: a.reason,
    patient: {
      id: a.patient.id,
      fullName: `${a.patient.firstNames} ${a.patient.lastNames}`,
      phone: a.patient.phone ?? a.patient.guardianPhone,
      documentNumber: a.patient.documentNumber,
      age: ageOn(birthDate, todayIn()),
    },
    doctor: { id: a.doctor.id, fullName: a.doctor.fullName, specialty: a.doctor.specialty },
    clinic: { id: a.clinic.id, name: a.clinic.name, timezone: a.clinic.timezone },
    cancelReason: a.cancelReason,
    cancelNote: a.cancelNote,
    cancelledAt: a.cancelledAt?.toISOString() ?? null,
    cancelledBy: a.cancelledById ? (names.get(a.cancelledById) ?? null) : null,
    createdBy: a.createdById ? (names.get(a.createdById) ?? null) : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    patientLink: `/c/${a.publicToken}`,
    remindedAt: a.remindedAt?.toISOString() ?? null,
    remindedBy: a.remindedById ? (names.get(a.remindedById) ?? null) : null,
    contactPhone: a.patient.phone ?? a.patient.guardianPhone,
    contactNote: a.patient.contactNote,
  };
  if (canSeeClinicalNote(user, a)) view.clinicalNote = a.clinicalNote;
  return view;
}
