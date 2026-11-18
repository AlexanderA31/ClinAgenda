import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleCreateSchema, RoleUpdateSchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { Can, CurrentUser, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { RolesService } from './roles.service';

class RoleCreateDto extends createZodDto(RoleCreateSchema) {}
class RoleUpdateDto extends createZodDto(RoleUpdateSchema) {}

@ApiTags('Roles y permisos')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** También lo necesita quien administra usuarios, para elegir el rol de cada persona. */
  @Can('roles.gestionar', 'usuarios.gestionar')
  @Get()
  list() {
    return this.roles.list();
  }

  @Can('roles.gestionar')
  @Post()
  create(@Body() body: RoleCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.roles.create(body, user, meta);
  }

  @Can('roles.gestionar')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: RoleUpdateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.roles.update(id, body, user, meta);
  }

  @Can('roles.gestionar')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.roles.remove(id, user, meta);
  }
}
