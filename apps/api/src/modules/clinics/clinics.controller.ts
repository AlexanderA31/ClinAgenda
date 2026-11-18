import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ClinicCreateSchema, ClinicUpdateSchema, ClosureCreateSchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, ReqMeta, Can, type RequestMeta } from '../../common/decorators/auth.decorators';
import { ClinicsService } from './clinics.service';
import { ClinicUpdateResultDto, ClinicViewDto, ClosureResultDto, OkDto } from '../../common/dto/responses';

class ClinicCreateDto extends createZodDto(ClinicCreateSchema) {}
class ClinicUpdateDto extends createZodDto(ClinicUpdateSchema) {}
class ClosureCreateDto extends createZodDto(ClosureCreateSchema) {}

@ApiTags('Clínicas')
@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  @ApiOkResponse({ type: ClinicViewDto, isArray: true })
  @Get()
  list() {
    return this.clinics.list();
  }

  @ApiOkResponse({ type: ClinicViewDto })
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.clinics.get(id);
  }

  @ApiCreatedResponse({ type: ClinicViewDto })
  @Can('clinicas.gestionar')
  @Post()
  create(@Body() body: ClinicCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.clinics.create(body, user, meta);
  }

  @ApiOkResponse({ type: ClinicUpdateResultDto })
  @Can('clinicas.gestionar')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: ClinicUpdateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.clinics.update(id, body, user, meta);
  }

  @ApiCreatedResponse({ type: ClosureResultDto })
  @Can('clinicas.gestionar')
  @Post(':id/closures')
  addClosure(@Param('id', ParseUUIDPipe) id: string, @Body() body: ClosureCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.clinics.addClosure(id, body, user, meta);
  }

  @ApiOkResponse({ type: OkDto })
  @Can('clinicas.gestionar')
  @Delete(':id/closures/:closureId')
  removeClosure(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.clinics.removeClosure(id, closureId, user, meta);
  }
}
