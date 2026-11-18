import { Body, Controller, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChangePasswordSchema, LoginSchema, MyProfileUpdateSchema, type SessionUser } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';
import { CurrentUser, Public, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { SESSION_COOKIE } from '../../common/guards/auth.guard';
import { env } from '../../config/env';
import { AuthService } from './auth.service';

class LoginDto extends createZodDto(LoginSchema) {}
class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
class MyProfileUpdateDto extends createZodDto(MyProfileUpdateSchema) {}

const SESSION_HOURS = 8;

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, maxAge: SESSION_HOURS * 3600 * 1000, path: '/' });
}

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Devuelve el usuario y deja la sesión en una cookie httpOnly (JavaScript no puede leerla). También devuelve el token para Swagger. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(body, meta);
    setSessionCookie(res, token);
    return { user, accessToken: token };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return user;
  }

  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: SessionUser, @Body() body: ChangePasswordDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.changePassword(user, body, meta);
  }

  /** "Mi usuario": datos completos de la propia cuenta. */
  @Get('me/profile')
  profile(@CurrentUser() user: SessionUser) {
    return this.auth.profile(user);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: SessionUser, @Body() body: MyProfileUpdateDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.updateProfile(user, body, meta);
  }

  @Post('me/revoke-other-sessions')
  @HttpCode(200)
  async revokeOtherSessions(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    setSessionCookie(res, await this.auth.revokeOtherSessions(user, meta));
    return { ok: true };
  }
}
