import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserCreateSchema, UserUpdateSchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, ReqMeta, Roles, type RequestMeta } from '../../common/decorators/auth.decorators';
import { UsersService } from './users.service';

class UserCreateDto extends createZodDto(UserCreateSchema) {}
class UserUpdateDto extends createZodDto(UserUpdateSchema) {}

@ApiTags('Usuarios')
@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() body: UserCreateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.users.create(body, user, meta);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UserUpdateDto, @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.users.update(id, body, user, meta);
  }
}
