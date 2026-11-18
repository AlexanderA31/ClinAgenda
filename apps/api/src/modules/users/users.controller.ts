import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserCreateSchema, UserUpdateSchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { Can, CurrentUser, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { UsersService } from './users.service';
import { UserViewDto } from '../../common/dto/responses';

class UserCreateDto extends createZodDto(UserCreateSchema) {}
class UserUpdateDto extends createZodDto(UserUpdateSchema) {}

@ApiTags('Usuarios')
@Controller('users')
@Can('usuarios.gestionar')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @ApiOkResponse({ type: UserViewDto, isArray: true })
  @Get()
  list() {
    return this.users.list();
  }

  @ApiCreatedResponse({ type: UserViewDto })
  @Post()
  create(@Body() body: UserCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.users.create(body, user, meta);
  }

  @ApiOkResponse({ type: UserViewDto })
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UserUpdateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.users.update(id, body, user, meta);
  }

  @ApiOkResponse({ type: UserViewDto })
  @Post(':id/unlock')
  @HttpCode(200)
  unlock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.users.unlock(id, user, meta);
  }

  @ApiOkResponse({ type: UserViewDto })
  @Post(':id/revoke-sessions')
  @HttpCode(200)
  revokeSessions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.users.revokeSessions(id, user, meta);
  }
}
