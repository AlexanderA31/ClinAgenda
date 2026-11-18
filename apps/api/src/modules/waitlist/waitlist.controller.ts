import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WaitlistCreateSchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, ReqMeta, Can, type RequestMeta } from '../../common/decorators/auth.decorators';
import { WaitlistService } from './waitlist.service';
import { WaitlistEntryViewDto } from '../../common/dto/responses';

class WaitlistCreateDto extends createZodDto(WaitlistCreateSchema) {}

@ApiTags('Lista de espera')
@Controller('waitlist')
@Can('lista_espera.gestionar')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @ApiOkResponse({ type: WaitlistEntryViewDto, isArray: true })
  @ApiQuery({ name: 'clinicId', required: false })
  @ApiQuery({ name: 'doctorId', required: false })
  @Get()
  list(
    @Query('clinicId', new ParseUUIDPipe({ optional: true })) clinicId?: string,
    @Query('doctorId', new ParseUUIDPipe({ optional: true })) doctorId?: string,
  ) {
    return this.waitlist.list(clinicId, doctorId);
  }

  @ApiCreatedResponse({ type: WaitlistEntryViewDto })
  @Post()
  create(@Body() body: WaitlistCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.waitlist.create(body, user, meta);
  }

  @ApiOkResponse({ type: WaitlistEntryViewDto })
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.waitlist.remove(id, user, meta);
  }
}
