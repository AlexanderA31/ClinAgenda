import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditQuerySchema } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/auth.decorators';
import { AuditService } from './audit.service';

class AuditQueryDto extends createZodDto(AuditQuerySchema) {}

@ApiTags('Auditoría')
@Controller('audit')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }
}
