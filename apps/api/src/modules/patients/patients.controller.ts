import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DuplicateCheckSchema, MergePatientsSchema, PatientCreateSchema, PatientSearchQuerySchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, ReqMeta, Can, type RequestMeta } from '../../common/decorators/auth.decorators';
import { PatientsService } from './patients.service';
import { DuplicateCandidateDto, MergeResultDto, PatientDetailDto, PatientPageDto, PatientViewDto } from '../../common/dto/responses';

class PatientCreateDto extends createZodDto(PatientCreateSchema) {}
class PatientSearchQueryDto extends createZodDto(PatientSearchQuerySchema) {}
class DuplicateCheckDto extends createZodDto(DuplicateCheckSchema) {}
class MergePatientsDto extends createZodDto(MergePatientsSchema) {}

@ApiTags('Pacientes')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @ApiOkResponse({ type: PatientPageDto })
  @Get()
  search(@Query() q: PatientSearchQueryDto, @CurrentUser() user: SessionUser) {
    return this.patients.search(q, user);
  }

  /** Mientras se llena el formulario, la web consulta si ya existe alguien parecido. */
  @ApiOkResponse({ type: DuplicateCandidateDto, isArray: true })
  @Can('pacientes.editar')
  @Post('duplicates')
  @HttpCode(200)
  duplicates(@Body() body: DuplicateCheckDto) {
    return this.patients.findDuplicates(body);
  }

  @ApiOkResponse({ type: MergeResultDto })
  @Can('pacientes.fusionar')
  @Post('merge')
  @HttpCode(200)
  merge(@Body() body: MergePatientsDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.patients.merge(body, user, meta);
  }

  @ApiOkResponse({ type: PatientDetailDto })
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.patients.get(id, user);
  }

  @ApiCreatedResponse({ type: PatientViewDto })
  @Can('pacientes.editar')
  @Post()
  create(@Body() body: PatientCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.patients.create(body, user, meta);
  }

  @ApiOkResponse({ type: PatientViewDto })
  @Can('pacientes.editar')
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: PatientCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.patients.update(id, body, user, meta);
  }
}
