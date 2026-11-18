import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { SessionUser, UserCreateInput, UserUpdateInput, UserView } from '@clinagenda/schemas';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import type { RequestMeta } from '../../common/decorators/auth.decorators';

function toView(u: User): UserView {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    active: u.active,
    doctorId: u.doctorId,
    clinicId: u.clinicId,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserView[]> {
    const users = await this.prisma.user.findMany({ orderBy: [{ active: 'desc' }, { fullName: 'asc' }] });
    return users.map(toView);
  }

  async create(input: UserCreateInput, actor: SessionUser, meta: RequestMeta): Promise<UserView> {
    const exists = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (exists) throw DomainError.validation('Ese nombre de usuario ya existe.', { username: 'Ya existe; elija otro.' });

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.fullName,
          role: input.role,
          passwordHash: await argon2.hash(input.password),
          doctorId: input.doctorId ?? null,
          clinicId: input.clinicId ?? null,
          mustChangePassword: true,
        },
      });
      await this.audit.log(
        { userId: actor.id, action: 'CREATE', entity: 'User', entityId: user.id, summary: `Creó el usuario ${user.username} (${user.role})`, after: toView(user), meta },
        tx,
      );
      return toView(user);
    });
  }

  async update(id: string, input: UserUpdateInput, actor: SessionUser, meta: RequestMeta): Promise<UserView> {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw DomainError.notFound('el usuario');
    if (id === actor.id && (input.active === false || (input.role && input.role !== 'ADMIN'))) {
      throw DomainError.validation('No puede desactivarse ni quitarse el rol de dirección a sí misma; así nadie queda fuera del sistema.');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          fullName: input.fullName,
          role: input.role,
          active: input.active,
          clinicId: input.clinicId,
          ...(input.resetPassword
            ? { passwordHash: await argon2.hash(input.resetPassword), mustChangePassword: true, failedAttempts: 0, lockedUntil: null }
            : {}),
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: input.resetPassword ? 'PASSWORD_RESET' : 'UPDATE',
          entity: 'User',
          entityId: id,
          summary: input.resetPassword ? `Restableció la contraseña de ${user.username}` : `Actualizó el usuario ${user.username}`,
          before: toView(before),
          after: toView(user),
          meta,
        },
        tx,
      );
      return toView(user);
    });
  }
}
