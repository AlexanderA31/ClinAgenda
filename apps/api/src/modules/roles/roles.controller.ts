import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RoleCreateSchema, RoleUpdateSchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { Can, CurrentUser, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { RolesService } from './roles.service';
import { OkDto, RoleViewDto } from '../../common/dto/responses';

class RoleCreateDto extends createZodDto(RoleCreateSchema) {}
class RoleUpdateDto extends createZodDto(RoleUpdateSchema) {}

@ApiTags('Roles y permisos')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** También lo necesita quien administra usuarios, para elegir el rol de cada persona. */
  @ApiOkResponse({ type: RoleViewDto, isArray: true })
  @Can('roles.gestionar', 'usuarios.gestionar')
  @Get()
  list() {
    return this.roles.list();
  }

  @ApiCreatedResponse({ type: RoleViewDto })
  @Can('roles.gestionar')
  @Post()
  create(@Body() body: RoleCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.roles.create(body, user, meta);
  }

  @ApiOkResponse({ type: RoleViewDto })
  @Can('roles.gestionar')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: RoleUpdateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.roles.update(id, body, user, meta);
  }

  @ApiOkResponse({ type: OkDto })
  @Can('roles.gestionar')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.roles.remove(id, user, meta);
  }
}
