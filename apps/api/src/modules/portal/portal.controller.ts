import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChangePasswordSchema, PatientLoginSchema, PatientRegisterSchema, PortalAvailabilityQuerySchema, PortalBookSchema, PortalProfileUpdateSchema } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';
import { Public, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { CurrentPatient, PATIENT_COOKIE, PatientAuthGuard, setPatientCookie, type PatientSession } from './patient-auth.guard';
import { PortalService } from './portal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationListDto, OkDto, PortalAppointmentDto, PortalAvailabilityDto, PortalMeDto, PortalSessionDto } from '../../common/dto/responses';

class PatientRegisterDto extends createZodDto(PatientRegisterSchema) {}
class PatientLoginDto extends createZodDto(PatientLoginSchema) {}
class PortalBookDto extends createZodDto(PortalBookSchema) {}
class PortalAvailabilityQueryDto extends createZodDto(PortalAvailabilityQuerySchema) {}
class PortalProfileUpdateDto extends createZodDto(PortalProfileUpdateSchema) {}
class PortalPasswordDto extends createZodDto(ChangePasswordSchema) {}


/** Portal del paciente. @Public frente al guard del personal; las rutas privadas usan PatientAuthGuard. */
@ApiTags('Portal del paciente')
@Public()
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly notices: NotificationsService,
  ) {}

  @ApiCreatedResponse({ type: PortalSessionDto })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() body: PatientRegisterDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { token, me } = await this.portal.register(body, meta);
    setPatientCookie(res, token);
    return { me, accessToken: token };
  }

  @ApiOkResponse({ type: PortalSessionDto })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: PatientLoginDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { token, me } = await this.portal.login(body, meta);
    setPatientCookie(res, token);
    return { me, accessToken: token };
  }

  @ApiOkResponse({ type: OkDto })
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(PATIENT_COOKIE, { path: '/' });
    return { ok: true };
  }

  @ApiOkResponse({ type: PortalMeDto })
  @UseGuards(PatientAuthGuard)
  @Get('me')
  me(@CurrentPatient() session: PatientSession) {
    return this.portal.me(session);
  }

  @ApiOkResponse({ type: PortalMeDto })
  @UseGuards(PatientAuthGuard)
  @Patch('me')
  updateProfile(@CurrentPatient() session: PatientSession, @Body() body: PortalProfileUpdateDto, @ReqMeta() meta: RequestMeta) {
    return this.portal.updateProfile(session, body, meta);
  }

  @ApiOkResponse({ type: OkDto })
  @UseGuards(PatientAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/password')
  @HttpCode(200)
  async changePassword(@CurrentPatient() session: PatientSession, @Body() body: PortalPasswordDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    setPatientCookie(res, await this.portal.changePassword(session, body, meta));
    return { ok: true };
  }

  @ApiOkResponse({ type: OkDto })
  @UseGuards(PatientAuthGuard)
  @Post('me/revoke-other-sessions')
  @HttpCode(200)
  async revokeOtherSessions(@CurrentPatient() session: PatientSession, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    setPatientCookie(res, await this.portal.revokeOtherSessions(session, meta));
    return { ok: true };
  }

  @ApiOkResponse({ type: PortalAvailabilityDto })
  @UseGuards(PatientAuthGuard)
  @Get('availability')
  availability(@Query() q: PortalAvailabilityQueryDto) {
    return this.portal.availability(q.clinicId, q.date, q.doctorId);
  }

  @ApiOkResponse({ type: PortalAppointmentDto, isArray: true })
  @UseGuards(PatientAuthGuard)
  @Get('appointments')
  appointments(@CurrentPatient() session: PatientSession) {
    return this.portal.appointments(session);
  }

  @ApiCreatedResponse({ type: PortalAppointmentDto })
  @UseGuards(PatientAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('appointments')
  book(@CurrentPatient() session: PatientSession, @Body() body: PortalBookDto, @ReqMeta() meta: RequestMeta) {
    return this.portal.book(session, body, meta);
  }

  /** Comprobante para descargar (PDF con QR para ver o cancelar). */
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Comprobante en PDF', schema: { type: 'string', format: 'binary' } })
  @UseGuards(PatientAuthGuard)
  @Get('appointments/:id/comprobante.pdf')
  async receipt(@CurrentPatient() session: PatientSession, @Param('id', ParseUUIDPipe) id: string) {
    const { filename, pdf } = await this.portal.receipt(session, id);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }

  @ApiOkResponse({ type: PortalAppointmentDto })
  @UseGuards(PatientAuthGuard)
  @Post('appointments/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentPatient() session: PatientSession, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.portal.cancel(session, id, meta);
  }

  /** Avisos del paciente: su cita fue confirmada, cambió de hora, etc. */
  @ApiOkResponse({ type: NotificationListDto })
  @UseGuards(PatientAuthGuard)
  @Get('notifications')
  notifications(@CurrentPatient() session: PatientSession) {
    return this.notices.list({ patientId: session.patientId });
  }

  @ApiOkResponse({ type: NotificationListDto })
  @UseGuards(PatientAuthGuard)
  @Post('notifications/read-all')
  @HttpCode(200)
  readAllNotifications(@CurrentPatient() session: PatientSession) {
    return this.notices.markAllRead({ patientId: session.patientId });
  }

  @ApiOkResponse({ type: NotificationListDto })
  @UseGuards(PatientAuthGuard)
  @Post('notifications/:id/read')
  @HttpCode(200)
  readNotification(@CurrentPatient() session: PatientSession, @Param('id', ParseUUIDPipe) id: string) {
    return this.notices.markRead({ patientId: session.patientId }, id);
  }
}
