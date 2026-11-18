import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportQuerySchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { ReportsService } from './reports.service';

class ReportQueryDto extends createZodDto(ReportQuerySchema) {}

@ApiTags('Reportes')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Indicadores del panel. Un médico solo ve los de su propia agenda. */
  @Get('dashboard')
  dashboard(@Query() q: ReportQueryDto, @CurrentUser() user: SessionUser) {
    return this.reports.dashboard(q, user);
  }
}
