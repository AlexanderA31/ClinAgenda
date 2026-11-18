import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UseInterceptors } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  AppointmentCancelSchema,
  AppointmentRejectSchema,
  AppointmentCreateSchema,
  AppointmentListQuerySchema,
  AppointmentRescheduleSchema,
  AppointmentStatusUpdateSchema,
  AvailabilityQuerySchema,
  ClinicalNoteSchema,
  type SessionUser,
} from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, ReqMeta, Can, type RequestMeta } from '../../common/decorators/auth.decorators';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { AppointmentsService } from './appointments.service';
import { SchedulingService } from './scheduling.service';

class AppointmentCreateDto extends createZodDto(AppointmentCreateSchema) {}
class AppointmentRescheduleDto extends createZodDto(AppointmentRescheduleSchema) {}
class AppointmentCancelDto extends createZodDto(AppointmentCancelSchema) {}
class AppointmentRejectDto extends createZodDto(AppointmentRejectSchema) {}
class AppointmentStatusDto extends createZodDto(AppointmentStatusUpdateSchema) {}
class ClinicalNoteDto extends createZodDto(ClinicalNoteSchema) {}
class AppointmentListQueryDto extends createZodDto(AppointmentListQuerySchema) {}
class AvailabilityQueryDto extends createZodDto(AvailabilityQuerySchema) {}
class RemindedDto extends createZodDto(z.object({ reminded: z.boolean() })) {}

const IdempotencyHeader = ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: 'Clave única por intento. Si la misma petición llega dos veces (reintento sin internet), solo se crea una cita.',
});

@ApiTags('Citas')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly scheduling: SchedulingService,
  ) {}

  @Get()
  list(@Query() q: AppointmentListQueryDto, @CurrentUser() user: SessionUser) {
    return this.appointments.list(q, user);
  }

  @Get('availability')
  availability(@Query() q: AvailabilityQueryDto) {
    return this.scheduling.availability(q.clinicId, q.date, q.doctorId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.appointments.get(id, user);
  }

  @Get(':id/comprobante.pdf')
  async receipt(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    const { filename, pdf } = await this.appointments.receipt(id, user);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }

  @Get(':id/events')
  events(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.appointments.events(id, user);
  }

  @IdempotencyHeader
  @UseInterceptors(IdempotencyInterceptor)
  @Can('citas.agendar')
  @Post()
  create(@Body() body: AppointmentCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.appointments.create(body, user, meta);
  }

  @IdempotencyHeader
  @UseInterceptors(IdempotencyInterceptor)
  @Can('citas.agendar')
  @Patch(':id/reschedule')
  reschedule(@Param('id', ParseUUIDPipe) id: string, @Body() body: AppointmentRescheduleDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.appointments.reschedule(id, body, user, meta);
  }

  @Can('citas.agendar')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: AppointmentCancelDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.appointments.cancel(id, body, user, meta);
  }

  /** Aceptar una cita que el paciente pidió en línea. */
  @Can('citas.agendar')
  @Post(':id/accept')
  @HttpCode(200)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.appointments.accept(id, user, meta);
  }

  /** Rechazar una solicitud en línea (con una nota para el paciente). */
  @Can('citas.agendar')
  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() body: AppointmentRejectDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.appointments.reject(id, body, user, meta);
  }

  @Can('citas.agendar')
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.appointments.restore(id, user, meta);
  }

  @Can('citas.estado')
  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: AppointmentStatusDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.appointments.setStatus(id, body, user, meta);
  }

  @Can('recordatorios.gestionar')
  @Patch(':id/reminded')
  setReminded(@Param('id', ParseUUIDPipe) id: string, @Body() body: RemindedDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.appointments.setReminded(id, body.reminded, user, meta);
  }

  @Can('citas.notas')
  @Patch(':id/clinical-note')
  setClinicalNote(@Param('id', ParseUUIDPipe) id: string, @Body() body: ClinicalNoteDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.appointments.setClinicalNote(id, body, user, meta);
  }
}
