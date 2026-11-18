import { BadRequestException, Controller, Param, ParseBoolPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { ImportKind, SessionUser } from '@clinagenda/schemas';
import { CurrentUser, ReqMeta, Roles, type RequestMeta } from '../../common/decorators/auth.decorators';
import { ImportsService } from './imports.service';

const KINDS: ImportKind[] = ['patients', 'doctors', 'appointments'];

@ApiTags('Importación')
@Controller('imports')
@Roles('ADMIN')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiQuery({ name: 'dryRun', required: false, description: 'true = solo vista previa, no guarda nada (predeterminado).' })
  @Post(':kind')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  run(
    @Param('kind') kind: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun', new ParseBoolPipe({ optional: true })) dryRun: boolean | undefined,
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    if (!KINDS.includes(kind as ImportKind)) throw new BadRequestException({ statusCode: 400, code: 'VALIDATION', message: 'Tipo de importación no válido.' });
    return this.imports.run(kind as ImportKind, file, dryRun ?? true, user, meta);
  }
}
