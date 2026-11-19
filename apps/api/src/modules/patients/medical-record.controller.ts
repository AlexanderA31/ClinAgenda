import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ConsultationCreateSchema, ConsultationUpdateSchema, MedicalHistorySchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { Can, CurrentUser, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { ConsultationViewDto, MedicalRecordViewDto } from '../../common/dto/responses';
import { MedicalRecordService } from './medical-record.service';

class MedicalHistoryDto extends createZodDto(MedicalHistorySchema) {}
class ConsultationCreateDto extends createZodDto(ConsultationCreateSchema) {}
class ConsultationUpdateDto extends createZodDto(ConsultationUpdateSchema) {}

/** Ficha médica: solo médicos (de sus pacientes) y dirección. Recepción recibe 403. */
@ApiTags('Ficha médica')
@Controller('patients/:id')
export class MedicalRecordController {
  constructor(private readonly records: MedicalRecordService) {}

  @ApiOkResponse({ type: MedicalRecordViewDto })
  @Get('medical-record')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.records.get(id, user);
  }

  @ApiOkResponse({ type: MedicalRecordViewDto })
  @Can('fichas.editar')
  @Put('medical-record')
  saveHistory(@Param('id', ParseUUIDPipe) id: string, @Body() body: MedicalHistoryDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.records.saveHistory(id, body, user, meta);
  }

  @ApiCreatedResponse({ type: ConsultationViewDto })
  @Can('fichas.editar')
  @Post('consultations')
  addConsultation(@Param('id', ParseUUIDPipe) id: string, @Body() body: ConsultationCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.records.addConsultation(id, body, user, meta);
  }

  @ApiOkResponse({ type: ConsultationViewDto })
  @Can('fichas.editar')
  @Put('consultations/:consultationId')
  updateConsultation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('consultationId', ParseUUIDPipe) consultationId: string,
    @Body() body: ConsultationUpdateDto,
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.records.updateConsultation(id, consultationId, body, user, meta);
  }
}
