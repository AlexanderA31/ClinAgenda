import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ATTACHMENT_MAX_BYTES, AttachmentUpdateSchema, AttachmentUploadSchema, ConsultationCreateSchema, ConsultationUpdateSchema, MedicalHistorySchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { Can, CurrentUser, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { ConsultationViewDto, MedicalAttachmentViewDto, MedicalRecordViewDto, OkDto } from '../../common/dto/responses';
import { MedicalRecordService } from './medical-record.service';

class MedicalHistoryDto extends createZodDto(MedicalHistorySchema) {}
class ConsultationCreateDto extends createZodDto(ConsultationCreateSchema) {}
class ConsultationUpdateDto extends createZodDto(ConsultationUpdateSchema) {}
class AttachmentUploadDto extends createZodDto(AttachmentUploadSchema) {}
class AttachmentUpdateDto extends createZodDto(AttachmentUpdateSchema) {}

/** Un archivo clínico se muestra en el navegador pero aislado: sin scripts, sin adivinar el tipo y sin quedar en caché. */
export function sendClinicalFile(res: Response, file: { filename: string; mime: string; data: Buffer }) {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'", 'Cache-Control': 'private, no-store' });
  return new StreamableFile(file.data, { type: file.mime, disposition: `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}` });
}

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

  /** Receta en PDF (A5) para imprimir, firmar y sellar. */
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Receta en PDF' })
  @Get('consultations/:consultationId/receta.pdf')
  async prescription(@Param('id', ParseUUIDPipe) id: string, @Param('consultationId', ParseUUIDPipe) consultationId: string, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    const { filename, pdf } = await this.records.prescription(id, consultationId, user, meta);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: `inline; filename="${filename}"` });
  }

  @ApiCreatedResponse({ type: MedicalAttachmentViewDto })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' }, description: { type: 'string' }, sharedWithPatient: { type: 'boolean' }, consultationId: { type: 'string', format: 'uuid' } },
    },
  })
  @Can('fichas.editar')
  @Post('attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES + 1, files: 1 } }))
  addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: AttachmentUploadDto,
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.records.addAttachment(id, file, body, user, meta);
  }

  @ApiProduces('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ description: 'El archivo' })
  @Get('attachments/:attachmentId')
  async attachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendClinicalFile(res, await this.records.attachmentFile(id, attachmentId, user, meta));
  }

  @ApiOkResponse({ type: MedicalAttachmentViewDto })
  @Can('fichas.editar')
  @Patch('attachments/:attachmentId')
  shareAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Body() body: AttachmentUpdateDto,
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.records.setAttachmentShared(id, attachmentId, body.sharedWithPatient, user, meta);
  }

  @ApiOkResponse({ type: OkDto })
  @Can('fichas.editar')
  @Delete('attachments/:attachmentId')
  removeAttachment(@Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.records.removeAttachment(id, attachmentId, user, meta);
  }
}
