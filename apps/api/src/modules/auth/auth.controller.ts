import { Body, Controller, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChangePasswordSchema, LoginSchema, MyProfileUpdateSchema, SignInSchema, type SessionUser, type SignInResult } from '@clinagenda/schemas';
import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';
import { CurrentUser, Public, ReqMeta, type RequestMeta } from '../../common/decorators/auth.decorators';
import { SESSION_COOKIE } from '../../common/guards/auth.guard';
import { env } from '../../config/env';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalService } from '../portal/portal.service';
import { setPatientCookie } from '../portal/patient-auth.guard';
import { DomainError } from '../../common/errors/domain-error';
import { LoginResultDto, MyProfileDto, OkDto, SessionUserDto, SignInResultDto } from '../../common/dto/responses';

class LoginDto extends createZodDto(LoginSchema) {}
class SignInDto extends createZodDto(SignInSchema) {}
class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
class MyProfileUpdateDto extends createZodDto(MyProfileUpdateSchema) {}

const SESSION_HOURS = 8;

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, maxAge: SESSION_HOURS * 3600 * 1000, path: '/' });
}

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly portal: PortalService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Ingreso único (personal y pacientes). Si el texto es el usuario de alguien del personal, se abre su
   * sesión; si no, se busca la cuenta de paciente con esa cédula o pasaporte. El mensaje de error es el
   * mismo en todos los casos, para no revelar qué usuarios o documentos existen.
   */
  @ApiOkResponse({ type: SignInResultDto })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('sign-in')
  @HttpCode(200)
  async signIn(@Body() body: SignInDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response): Promise<SignInResult> {
    const invalid = DomainError.validation('Usuario, documento o contraseña incorrectos. Revise que no tenga activadas las mayúsculas.');
    const username = body.identifier.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { username }, select: { id: true } })) {
      try {
        const { token, user } = await this.auth.login({ username, password: body.password }, meta);
        setSessionCookie(res, token);
        return { kind: 'staff', user };
      } catch (e) {
        throw e instanceof DomainError && e.getStatus() === 400 ? invalid : e;
      }
    }
    try {
      const { token } = await this.portal.login({ documentNumber: body.identifier.replace(/[\s-]/g, '').toUpperCase(), password: body.password }, meta);
      setPatientCookie(res, token);
      return { kind: 'patient' };
    } catch (e) {
      throw e instanceof DomainError && e.getStatus() === 400 ? invalid : e;
    }
  }

  /** Devuelve el usuario y deja la sesión en una cookie httpOnly (JavaScript no puede leerla). También devuelve el token para Swagger. */
  @ApiOkResponse({ type: LoginResultDto })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(body, meta);
    setSessionCookie(res, token);
    return { user, accessToken: token };
  }

  @ApiOkResponse({ type: OkDto })
  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @ApiOkResponse({ type: SessionUserDto })
  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return user;
  }

  @ApiOkResponse({ type: OkDto })
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: SessionUser, @Body() body: ChangePasswordDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.changePassword(user, body, meta);
  }

  /** "Mi usuario": datos completos de la propia cuenta. */
  @ApiOkResponse({ type: MyProfileDto })
  @Get('me/profile')
  profile(@CurrentUser() user: SessionUser) {
    return this.auth.profile(user);
  }

  @ApiOkResponse({ type: MyProfileDto })
  @Patch('me')
  updateProfile(@CurrentUser() user: SessionUser, @Body() body: MyProfileUpdateDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.updateProfile(user, body, meta);
  }

  @ApiOkResponse({ type: OkDto })
  @Post('me/revoke-other-sessions')
  @HttpCode(200)
  async revokeOtherSessions(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    setSessionCookie(res, await this.auth.revokeOtherSessions(user, meta));
    return { ok: true };
  }
}
