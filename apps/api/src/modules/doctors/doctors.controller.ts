import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { DoctorCreateSchema, DoctorUpdateSchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, ReqMeta, Roles, type RequestMeta } from '../../common/decorators/auth.decorators';
import { DoctorsService } from './doctors.service';

class DoctorCreateDto extends createZodDto(DoctorCreateSchema) {}
class DoctorUpdateDto extends createZodDto(DoctorUpdateSchema) {}

@ApiTags('Médicos')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @ApiQuery({ name: 'clinicId', required: false })
  @Get()
  list(@Query('clinicId', new ParseUUIDPipe({ optional: true })) clinicId?: string) {
    return this.doctors.list(clinicId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.doctors.get(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() body: DoctorCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.doctors.create(body, user, meta);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: DoctorUpdateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.doctors.update(id, body, user, meta);
  }
}
