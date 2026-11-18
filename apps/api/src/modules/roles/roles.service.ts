import { Injectable } from '@nestjs/common';
import { ErrorCodes, PERMISSION_KEYS, type RoleCreateInput, type RoleUpdateInput, type RoleView, type SessionUser } from '@clinagenda/schemas';
import type { AccessRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import { knownPermissions } from '../../common/guards/auth.guard';
import type { RequestMeta } from '../../common/decorators/auth.decorators';

/** El rol de dirección de fábrica: siempre con todos los permisos, no se edita ni se borra. */
export function isLockedRole(role: Pick<AccessRole, 'system' | 'scope'>) {
  return role.system && role.scope === 'ADMIN';
}

function toView(r: AccessRole & { _count?: { users: number } }): RoleView {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    scope: r.scope,
    permissions: knownPermissions(r.permissions),
    system: r.system,
    locked: isLockedRole(r),
    userCount: r._count?.users ?? 0,
    createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleView[]> {
    const roles = await this.prisma.accessRole.findMany({
      include: { _count: { select: { users: { where: { active: true } } } } },
      orderBy: [{ system: 'desc' }, { createdAt: 'asc' }],
    });
    return roles.map(toView);
  }

  async create(input: RoleCreateInput, actor: SessionUser, meta: RequestMeta): Promise<RoleView> {
    await this.assertNameFree(input.name);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.accessRole.create({
        data: { name: input.name, description: input.description ?? null, scope: input.scope, permissions: sorted(input.permissions) },
      });
      await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'AccessRole', entityId: role.id, summary: `Creó el rol ${role.name}`, after: toView(role), meta }, tx);
      return toView(role);
    });
  }

  async update(id: string, input: RoleUpdateInput, actor: SessionUser, meta: RequestMeta): Promise<RoleView> {
    const before = await this.prisma.accessRole.findUnique({ where: { id } });
    if (!before) throw DomainError.notFound('el rol');
    if (isLockedRole(before)) throw DomainError.validation('El rol de dirección siempre tiene todos los permisos; así nadie queda fuera del sistema.');
    if (input.name && input.name !== before.name) await this.assertNameFree(input.name);
    // Quitarse a uno mismo la administración de roles dejaría el cambio sin vuelta atrás desde esta cuenta.
    if (actor.permissions.includes('roles.gestionar') && input.permissions && !input.permissions.includes('roles.gestionar')) {
      const mine = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { accessRoleId: true } });
      if (mine?.accessRoleId === id) throw DomainError.validation('No puede quitarle a su propio rol el permiso de administrar roles.');
    }

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.accessRole.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description === undefined ? undefined : input.description,
          permissions: input.permissions ? sorted(input.permissions) : undefined,
        },
        include: { _count: { select: { users: { where: { active: true } } } } },
      });
      await this.audit.log(
        { userId: actor.id, action: 'UPDATE', entity: 'AccessRole', entityId: id, summary: `Cambió el rol ${role.name}`, before: toView(before), after: toView(role), meta },
        tx,
      );
      return toView(role);
    });
  }

  async remove(id: string, actor: SessionUser, meta: RequestMeta) {
    const role = await this.prisma.accessRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw DomainError.notFound('el rol');
    if (role.system) throw DomainError.validation('Los roles de fábrica no se pueden borrar. Puede cambiar sus permisos.');
    if (role._count.users > 0) {
      throw DomainError.conflict(
        ErrorCodes.CONFLICT,
        `Hay ${role._count.users} usuario(s) con este rol (incluidos los desactivados). Asígneles otro rol antes de borrarlo.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.accessRole.delete({ where: { id } });
      await this.audit.log({ userId: actor.id, action: 'DELETE', entity: 'AccessRole', entityId: id, summary: `Borró el rol ${role.name}`, before: toView(role), meta }, tx);
    });
    return { ok: true };
  }

  private async assertNameFree(name: string) {
    const exists = await this.prisma.accessRole.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (exists) throw DomainError.validation('Ya existe un rol con ese nombre.', { name: 'Ya existe; elija otro nombre.' });
  }
}

/** Guarda los permisos en el orden del catálogo, sin repetidos: la bitácora compara antes/después limpio. */
function sorted(list: string[]) {
  return PERMISSION_KEYS.filter((k) => list.includes(k));
}
