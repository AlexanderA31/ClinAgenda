import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@clinagenda/schemas';
import { AuthedRequest, PERMISSIONS_KEY } from '../decorators/auth.decorators';
import { DomainError } from '../errors/domain-error';

/** Exige alguno de los permisos pedidos con @Can. Los permisos se leen del rol en cada petición. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const { user } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!user || !required.some((p) => user.permissions.includes(p))) throw DomainError.forbidden();
    return true;
  }
}
