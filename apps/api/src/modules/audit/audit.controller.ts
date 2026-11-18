import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuditQuerySchema } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { Can } from '../../common/decorators/auth.decorators';
import { AuditService } from './audit.service';
import { AuditPageDto } from '../../common/dto/responses';

class AuditQueryDto extends createZodDto(AuditQuerySchema) {}

@ApiTags('Auditoría')
@Controller('audit')
@Can('auditoria.ver')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @ApiOkResponse({ type: AuditPageDto })
  @Get()
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }
}
