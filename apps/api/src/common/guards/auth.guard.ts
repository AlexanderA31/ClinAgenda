import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PERMISSION_KEYS, type Permission, type SessionUser } from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthedRequest, IS_PUBLIC } from '../decorators/auth.decorators';

export const SESSION_COOKIE = 'clinagenda_session';

/**
 * Exige sesión en todas las rutas salvo las marcadas con @Public.
 * Acepta la cookie httpOnly (la web) o "Authorization: Bearer" (Swagger / pruebas).
 * Se consulta el usuario en cada petición para que desactivarlo, cambiarle el rol o cerrar sus
 * sesiones (tokenVersion) tenga efecto inmediato.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const token = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) throw new UnauthorizedException();

    let payload: { sub: string; v?: number; kind?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }

    // Una sesión del portal del paciente nunca vale para el sistema interno.
    if (payload.kind === 'patient') throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { accessRole: true } });
    if (!user || !user.active || (payload.v ?? 0) !== user.tokenVersion) throw new UnauthorizedException();

    req.user = toSessionUser(user);
    return true;
  }
}

export type UserWithRole = {
  id: string;
  username: string;
  fullName: string;
  role: SessionUser['role'];
  doctorId: string | null;
  clinicId: string | null;
  mustChangePassword: boolean;
  accessRole: { name: string; permissions: string[] };
};

/** Solo permisos que el sistema conoce: un texto viejo o mal escrito en la base no da acceso a nada. */
export function knownPermissions(list: string[]): Permission[] {
  return list.filter((p): p is Permission => (PERMISSION_KEYS as string[]).includes(p));
}

export function toSessionUser(user: UserWithRole): SessionUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    roleName: user.accessRole.name,
    permissions: knownPermissions(user.accessRole.permissions),
    doctorId: user.doctorId,
    clinicId: user.clinicId,
    mustChangePassword: user.mustChangePassword,
  };
}
