import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  AppointmentEventViewSchema,
  AppointmentViewSchema,
  ApiErrorSchema,
  AuditEntryViewSchema,
  AvailabilitySlotSchema,
  ClinicViewSchema,
  ConsultationViewSchema,
  DashboardReportSchema,
  DoctorViewSchema,
  DuplicateCandidateSchema,
  ImportReportSchema,
  IsoDateTimeSchema,
  IsoDaySchema,
  MedicalAttachmentViewSchema,
  MedicalRecordViewSchema,
  PortalMedicalRecordSchema,
  MyProfileSchema,
  NotificationListSchema,
  OkSchema,
  OrphanAppointmentSchema,
  PatientViewSchema,
  PortalAppointmentSchema,
  PortalMeSchema,
  PortalSlotSchema,
  PublicAppointmentViewSchema,
  PublicDirectorySchema,
  RoleViewSchema,
  SessionUserSchema,
  SystemStatusSchema,
  UserViewSchema,
  WaitlistEntryViewSchema,
  paginatedSchema,
} from '@clinagenda/schemas';

/**
 * Respuestas de la API para Swagger, hechas con los mismos esquemas que usa la web para sus tipos.
 * Solo documentan: la API no vuelve a validar lo que devuelve.
 */
export class ApiErrorDto extends createZodDto(ApiErrorSchema) {}
export class OkDto extends createZodDto(OkSchema) {}

export class SessionUserDto extends createZodDto(SessionUserSchema) {}
/** Lo que devuelve el ingreso único (SignInResult), plano: una clase de Swagger no puede ser una unión. `user` solo viene con kind "staff". */
export class SignInResultDto extends createZodDto(z.object({ kind: z.enum(['staff', 'patient']), user: SessionUserSchema.optional(), accessToken: z.string() })) {}
export class LoginResultDto extends createZodDto(z.object({ user: SessionUserSchema, accessToken: z.string() })) {}
export class MyProfileDto extends createZodDto(MyProfileSchema) {}

export class PortalMeDto extends createZodDto(PortalMeSchema) {}
export class PortalSessionDto extends createZodDto(z.object({ me: PortalMeSchema, accessToken: z.string() })) {}
export class PortalAppointmentDto extends createZodDto(PortalAppointmentSchema) {}
export class PortalAvailabilityDto extends createZodDto(z.object({ closed: z.string().nullable(), slots: z.array(PortalSlotSchema) })) {}

export class AppointmentViewDto extends createZodDto(AppointmentViewSchema) {}
export class AppointmentPageDto extends createZodDto(paginatedSchema(AppointmentViewSchema)) {}
export class AppointmentEventViewDto extends createZodDto(AppointmentEventViewSchema) {}
export class AvailabilityDto extends createZodDto(z.object({ closed: z.string().nullable(), slots: z.array(AvailabilitySlotSchema) })) {}
export class AppointmentCancelResultDto extends createZodDto(z.object({ appointment: AppointmentViewSchema, alreadyCancelled: z.boolean(), waitlistMatches: z.number().int() })) {}
export class PublicAppointmentViewDto extends createZodDto(PublicAppointmentViewSchema) {}
export class PublicCancelResultDto extends createZodDto(PublicAppointmentViewSchema.extend({ alreadyCancelled: z.boolean() })) {}
export class PublicDirectoryDto extends createZodDto(PublicDirectorySchema) {}

export class PatientViewDto extends createZodDto(PatientViewSchema) {}
export class PatientDetailDto extends createZodDto(PatientViewSchema.extend({ mergedIntoId: z.string().uuid().nullable() })) {}
export class PatientPageDto extends createZodDto(paginatedSchema(PatientViewSchema)) {}
export class MedicalRecordViewDto extends createZodDto(MedicalRecordViewSchema) {}
export class ConsultationViewDto extends createZodDto(ConsultationViewSchema) {}
export class MedicalAttachmentViewDto extends createZodDto(MedicalAttachmentViewSchema) {}
export class PortalMedicalRecordDto extends createZodDto(PortalMedicalRecordSchema) {}
export class DuplicateCandidateDto extends createZodDto(DuplicateCandidateSchema) {}
export class MergeResultDto extends createZodDto(z.object({ keptId: z.string().uuid(), movedAppointments: z.number().int() })) {}

export class OrphanAppointmentDto extends createZodDto(OrphanAppointmentSchema) {}
export class ClinicViewDto extends createZodDto(ClinicViewSchema) {}
export class ClinicUpdateResultDto extends createZodDto(ClinicViewSchema.extend({ appointmentsOutsideSchedule: z.array(OrphanAppointmentSchema) })) {}
export class ClosureResultDto extends createZodDto(z.object({ id: z.string().uuid(), date: IsoDaySchema, reason: z.string(), appointmentsToReschedule: z.number().int() })) {}
export class DoctorViewDto extends createZodDto(DoctorViewSchema) {}
export class DoctorUpdateResultDto extends createZodDto(DoctorViewSchema.extend({ appointmentsOutsideSchedule: z.array(OrphanAppointmentSchema) })) {}

export class UserViewDto extends createZodDto(UserViewSchema) {}
export class RoleViewDto extends createZodDto(RoleViewSchema) {}
export class AuditPageDto extends createZodDto(paginatedSchema(AuditEntryViewSchema)) {}
export class WaitlistEntryViewDto extends createZodDto(WaitlistEntryViewSchema) {}
export class ImportReportDto extends createZodDto(ImportReportSchema) {}
export class DashboardReportDto extends createZodDto(DashboardReportSchema) {}
export class SystemStatusDto extends createZodDto(SystemStatusSchema) {}
export class BackupStatusDto extends createZodDto(
  z.object({
    state: z.enum(['OK', 'SIN_COPIA_EXTERNA', 'ATRASADO', 'FALLO', 'DESCONOCIDO']),
    message: z.string(),
    lastAt: IsoDateTimeSchema.nullable(),
    file: z.string().nullable(),
    bytes: z.number().int(),
  }),
) {}
export class HealthDto extends createZodDto(z.object({ status: z.literal('ok'), database: z.literal('ok'), time: IsoDateTimeSchema })) {}
export class NotificationListDto extends createZodDto(NotificationListSchema) {}
