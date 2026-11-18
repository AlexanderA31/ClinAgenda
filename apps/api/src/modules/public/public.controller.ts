import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PublicCancelSchema } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { Public, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { PublicService } from './public.service';

class PublicCancelDto extends createZodDto(PublicCancelSchema) {}

@ApiTags('Enlace del paciente (sin sesión)')
@Controller('public/appointments')
@Public()
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get(':token')
  view(@Param('token') token: string) {
    return this.service.view(token);
  }

  @Post(':token/cancel')
  @HttpCode(200)
  cancel(@Param('token') token: string, @Body() _body: PublicCancelDto, @ReqMeta() meta: RequestMeta) {
    return this.service.cancel(token, meta);
  }
}
