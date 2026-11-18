import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { SessionUser, UserCreateInput, UserUpdateInput, UserView } from '@clinagenda/schemas';
import type { AccessRole, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import { knownPermissions } from '../../common/guards/auth.guard';
import type { RequestMeta } from '../../common/decorators/auth.decorators';
import { isLockedRole } from '../roles/roles.service';

type UserWithRole = User & { accessRole: AccessRole };

function toView(u: UserWithRole): UserView {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.accessRole.scope,
    roleId: u.accessRoleId,
    roleName: u.accessRole.name,
    permissions: knownPermissions(u.accessRole.permissions),
    active: u.active,
    lockedUntil: u.lockedUntil && u.lockedUntil > new Date() ? u.lockedUntil.toISOString() : null,
    mustChangePassword: u.mustChangePassword,
    doctorId: u.doctorId,
    clinicId: u.clinicId,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

const include = { accessRole: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserView[]> {
    const users = await this.prisma.user.findMany({ include, orderBy: [{ active: 'desc' }, { fullName: 'asc' }] });
    return users.map(toView);
  }

  async create(input: UserCreateInput, actor: SessionUser, meta: RequestMeta): Promise<UserView> {
    const exists = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (exists) throw DomainError.validation('Ese nombre de usuario ya existe.', { username: 'Ya existe; elija otro.' });
    const role = await this.role(input.roleId);
    await this.assertDoctorLink(role, input.doctorId ?? null, null);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.fullName,
          role: role.scope,
          accessRoleId: role.id,
          passwordHash: await argon2.hash(input.password),
          doctorId: input.doctorId ?? null,
          clinicId: input.clinicId ?? null,
          mustChangePassword: true,
        },
        include,
      });
      await this.audit.log(
        { userId: actor.id, action: 'CREATE', entity: 'User', entityId: user.id, summary: `Creó el usuario ${user.username} (${role.name})`, after: toView(user), meta },
        tx,
      );
      return toView(user);
    });
  }

  async update(id: string, input: UserUpdateInput, actor: SessionUser, meta: RequestMeta): Promise<UserView> {
    const before = await this.prisma.user.findUnique({ where: { id }, include });
    if (!before) throw DomainError.notFound('el usuario');
    const roleChanges = input.roleId !== undefined && input.roleId !== before.accessRoleId;
    if (id === actor.id && (input.active === false || roleChanges)) {
      throw DomainError.validation('No puede desactivarse ni cambiarse el rol a sí misma; así nadie queda fuera del sistema.');
    }
    const role = roleChanges ? await this.role(input.roleId!) : before.accessRole;
    const doctorId = input.doctorId !== undefined ? input.doctorId : before.doctorId;
    await this.assertDoctorLink(role, doctorId, id);
    if ((input.active === false || roleChanges) && isLockedRole(before.accessRole) && before.active) await this.assertAnotherAdmin(id);

    // Desactivar, cambiar de rol o cambiar la contraseña cierra las sesiones abiertas de esa persona.
    const revoke = input.active === false || roleChanges || !!input.resetPassword;
    const data: Prisma.UserUpdateInput = {
      fullName: input.fullName,
      active: input.active,
      clinic: input.clinicId === undefined ? undefined : input.clinicId ? { connect: { id: input.clinicId } } : { disconnect: true },
      doctor: input.doctorId === undefined ? undefined : input.doctorId ? { connect: { id: input.doctorId } } : { disconnect: true },
      ...(roleChanges ? { accessRole: { connect: { id: role.id } }, role: role.scope } : {}),
      ...(revoke ? { tokenVersion: { increment: 1 } } : {}),
      ...(input.resetPassword
        ? { passwordHash: await argon2.hash(input.resetPassword), mustChangePassword: true, failedAttempts: 0, lockedUntil: null }
        : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data, include });
      const summary = input.resetPassword
        ? `Restableció la contraseña de ${user.username}`
        : roleChanges
          ? `Cambió el rol de ${user.username} de ${before.accessRole.name} a ${role.name}`
          : input.active === false
            ? `Desactivó a ${user.username}`
            : input.active === true && !before.active
              ? `Reactivó a ${user.username}`
              : `Actualizó el usuario ${user.username}`;
      await this.audit.log(
        { userId: actor.id, action: input.resetPassword ? 'PASSWORD_RESET' : 'UPDATE', entity: 'User', entityId: id, summary, before: toView(before), after: toView(user), meta },
        tx,
      );
      return toView(user);
    });
  }

  /** Quita el bloqueo por intentos fallidos sin cambiar la contraseña. */
  async unlock(id: string, actor: SessionUser, meta: RequestMeta): Promise<UserView> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { failedAttempts: 0, lockedUntil: null }, include }).catch(() => {
        throw DomainError.notFound('el usuario');
      });
      await this.audit.log({ userId: actor.id, action: 'UNLOCK', entity: 'User', entityId: id, summary: `Desbloqueó a ${user.username}`, meta }, tx);
      return toView(user);
    });
  }

  /** Cierra las sesiones abiertas en todos los equipos (por ejemplo, si se perdió un celular). */
  async revokeSessions(id: string, actor: SessionUser, meta: RequestMeta): Promise<UserView> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } }, include }).catch(() => {
        throw DomainError.notFound('el usuario');
      });
      await this.audit.log(
        { userId: actor.id, action: 'SESSIONS_REVOKED', entity: 'User', entityId: id, summary: `Cerró las sesiones de ${user.username} en todos los equipos`, meta },
        tx,
      );
      return toView(user);
    });
  }

  private async role(id: string) {
    const role = await this.prisma.accessRole.findUnique({ where: { id } });
    if (!role) throw DomainError.validation('Ese rol no existe.', { roleId: 'Elija un rol de la lista.' });
    return role;
  }

  /** Un rol "solo su agenda" necesita saber cuál es la agenda: la ficha del médico, y una sola cuenta por ficha. */
  private async assertDoctorLink(role: AccessRole, doctorId: string | null, userId: string | null) {
    if (role.scope === 'MEDICO' && !doctorId) {
      throw DomainError.validation('Este rol ve solo la agenda de un médico: vincule la ficha del médico.', { doctorId: 'Elija la ficha del médico.' });
    }
    if (doctorId) {
      const taken = await this.prisma.user.findFirst({ where: { doctorId, NOT: userId ? { id: userId } : undefined } });
      if (taken) throw DomainError.validation(`Esa ficha de médico ya está vinculada al usuario ${taken.username}.`, { doctorId: 'Ya tiene usuario.' });
    }
  }

  private async assertAnotherAdmin(exceptId: string) {
    const others = await this.prisma.user.count({ where: { id: { not: exceptId }, active: true, accessRole: { system: true, scope: 'ADMIN' } } });
    if (!others) throw DomainError.validation('Debe quedar al menos una persona activa con el rol de Dirección.');
  }
}
