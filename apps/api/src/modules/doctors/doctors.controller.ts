import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DoctorCreateSchema, DoctorUpdateSchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, ReqMeta, Can, type RequestMeta } from '../../common/decorators/auth.decorators';
import { DoctorsService } from './doctors.service';
import { DoctorUpdateResultDto, DoctorViewDto, OrphanAppointmentDto } from '../../common/dto/responses';

class DoctorCreateDto extends createZodDto(DoctorCreateSchema) {}
class DoctorUpdateDto extends createZodDto(DoctorUpdateSchema) {}

@ApiTags('Médicos')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @ApiOkResponse({ type: DoctorViewDto, isArray: true })
  @ApiQuery({ name: 'clinicId', required: false })
  @Get()
  list(@Query('clinicId', new ParseUUIDPipe({ optional: true })) clinicId?: string) {
    return this.doctors.list(clinicId);
  }

  @ApiOkResponse({ type: DoctorViewDto })
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.doctors.get(id);
  }

  /** Citas futuras que quedaron fuera del horario del médico y hay que reprogramar. */
  @ApiOkResponse({ type: OrphanAppointmentDto, isArray: true })
  @Can('medicos.gestionar', 'citas.agendar')
  @Get(':id/orphans')
  orphans(@Param('id', ParseUUIDPipe) id: string) {
    return this.doctors.orphans(id);
  }

  @ApiCreatedResponse({ type: DoctorViewDto })
  @Can('medicos.gestionar')
  @Post()
  create(@Body() body: DoctorCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.doctors.create(body, user, meta);
  }

  @ApiOkResponse({ type: DoctorUpdateResultDto })
  @Can('medicos.gestionar')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: DoctorUpdateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.doctors.update(id, body, user, meta);
  }
}
