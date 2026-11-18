import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PatientLoginSchema, PatientRegisterSchema, PortalAvailabilityQuerySchema, PortalBookSchema } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';
import { Public, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { CurrentPatient, PATIENT_COOKIE, PatientAuthGuard, setPatientCookie, type PatientSession } from './patient-auth.guard';
import { PortalService } from './portal.service';

class PatientRegisterDto extends createZodDto(PatientRegisterSchema) {}
class PatientLoginDto extends createZodDto(PatientLoginSchema) {}
class PortalBookDto extends createZodDto(PortalBookSchema) {}
class PortalAvailabilityQueryDto extends createZodDto(PortalAvailabilityQuerySchema) {}


/** Portal del paciente. @Public frente al guard del personal; las rutas privadas usan PatientAuthGuard. */
@ApiTags('Portal del paciente')
@Public()
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() body: PatientRegisterDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { token, me } = await this.portal.register(body, meta);
    setPatientCookie(res, token);
    return { me, accessToken: token };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: PatientLoginDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { token, me } = await this.portal.login(body, meta);
    setPatientCookie(res, token);
    return { me, accessToken: token };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(PATIENT_COOKIE, { path: '/' });
    return { ok: true };
  }

  @UseGuards(PatientAuthGuard)
  @Get('me')
  me(@CurrentPatient() session: PatientSession) {
    return this.portal.me(session);
  }

  @UseGuards(PatientAuthGuard)
  @Get('availability')
  availability(@Query() q: PortalAvailabilityQueryDto) {
    return this.portal.availability(q.clinicId, q.date, q.doctorId);
  }

  @UseGuards(PatientAuthGuard)
  @Get('appointments')
  appointments(@CurrentPatient() session: PatientSession) {
    return this.portal.appointments(session);
  }

  @UseGuards(PatientAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('appointments')
  book(@CurrentPatient() session: PatientSession, @Body() body: PortalBookDto, @ReqMeta() meta: RequestMeta) {
    return this.portal.book(session, body, meta);
  }

  @UseGuards(PatientAuthGuard)
  @Post('appointments/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentPatient() session: PatientSession, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.portal.cancel(session, id, meta);
  }
}
