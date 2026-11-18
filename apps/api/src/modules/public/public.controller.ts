import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PublicCancelSchema } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { Public, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { PublicService } from './public.service';
import { PublicAppointmentViewDto, PublicCancelResultDto, PublicDirectoryDto } from '../../common/dto/responses';

class PublicCancelDto extends createZodDto(PublicCancelSchema) {}

@ApiTags('Enlace del paciente (sin sesión)')
@Controller('public')
@Public()
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class PublicController {
  constructor(private readonly service: PublicService) {}

  /** Clínicas, horarios y médicos para la página web pública. */
  @ApiOkResponse({ type: PublicDirectoryDto })
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('directory')
  directory() {
    return this.service.directory();
  }

  @ApiOkResponse({ type: PublicAppointmentViewDto })
  @Get('appointments/:token')
  view(@Param('token') token: string) {
    return this.service.view(token);
  }

  @ApiOkResponse({ type: PublicCancelResultDto })
  @Post('appointments/:token/cancel')
  @HttpCode(200)
  cancel(@Param('token') token: string, @Body() _body: PublicCancelDto, @ReqMeta() meta: RequestMeta) {
    return this.service.cancel(token, meta);
  }
}
