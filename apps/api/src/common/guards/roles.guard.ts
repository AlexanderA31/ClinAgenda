import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@clinagenda/schemas';
import { AuthedRequest, ROLES } from '../decorators/auth.decorators';
import { DomainError } from '../errors/domain-error';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const { user } = context.switchToHttp().getRequest<AuthedRequest>();
    if (!user || !roles.includes(user.role)) throw DomainError.forbidden();
    return true;
  }
}
