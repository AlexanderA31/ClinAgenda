import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Role, SessionUser } from '@clinagenda/schemas';
import type { Request } from 'express';

export const IS_PUBLIC = 'isPublic';
/** Ruta accesible sin iniciar sesión (login, salud del sistema). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Solo estos roles pueden usar la ruta. Sin @Roles, cualquier usuario con sesión puede. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export interface AuthedRequest extends Request {
  user: SessionUser;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** IP y navegador de quien hace el cambio, para la bitácora. */
export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent']?.slice(0, 200) ?? null };
});
