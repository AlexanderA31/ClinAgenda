import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { ErrorCodes, type ChangePasswordInput, type LoginInput, type MyProfile, type MyProfileUpdateInput, type SessionUser } from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import { SESSION_INCLUDE, toSessionUser } from '../../common/guards/auth.guard';
import type { RequestMeta } from '../../common/decorators/auth.decorators';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, meta: RequestMeta): Promise<{ token: string; user: SessionUser }> {
    const user = await this.prisma.user.findUnique({ where: { username: input.username }, include: SESSION_INCLUDE });
    // Mismo mensaje si el usuario no existe o la clave es incorrecta: no revelamos qué usuarios existen.
    const invalid = DomainError.validation('Usuario o contraseña incorrectos. Revise que no tenga activadas las mayúsculas.');

    if (!user || !user.active) {
      await argon2.hash(input.password); // tiempo de respuesta similar exista o no el usuario
      throw invalid;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new DomainError(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCodes.TOO_MANY_ATTEMPTS,
        `Por seguridad, este usuario quedó bloqueado por demasiados intentos. Intente en ${minutes} minuto(s) o pida a la dirección que lo desbloquee.`,
      );
    }

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      const failed = user.failedAttempts + 1;
      const lock = failed >= MAX_FAILED_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null },
      });
      await this.audit.log({ userId: user.id, action: 'LOGIN_FAILED', entity: 'User', entityId: user.id, summary: `Contraseña incorrecta (${failed})`, meta });
      throw invalid;
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.log({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, summary: 'Ingresó al sistema', meta });

    const token = await this.jwt.signAsync({ sub: user.id, v: user.tokenVersion });
    return { token, user: toSessionUser(user) };
  }

  async changePassword(user: SessionUser, input: ChangePasswordInput, meta: RequestMeta) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await argon2.verify(record.passwordHash, input.currentPassword))) {
      throw DomainError.validation('La contraseña actual no es correcta.', { currentPassword: 'La contraseña actual no es correcta.' });
    }
    if (input.currentPassword === input.newPassword) {
      throw DomainError.validation('La nueva contraseña debe ser distinta de la actual.', { newPassword: 'Debe ser distinta de la actual.' });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(input.newPassword), mustChangePassword: false },
    });
    await this.audit.log({ userId: user.id, action: 'PASSWORD_CHANGED', entity: 'User', entityId: user.id, summary: 'Cambió su contraseña', meta });
    return { ok: true };
  }

  async profile(user: SessionUser): Promise<MyProfile> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { accessRole: true, clinics: { include: { clinic: true } }, doctor: true } });
    return {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      roleName: u.accessRole.name,
      clinicNames: u.clinics.map((c) => c.clinic.name).sort(),
      doctorName: u.doctor?.fullName ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    };
  }

  async updateProfile(user: SessionUser, input: MyProfileUpdateInput, meta: RequestMeta): Promise<MyProfile> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { fullName: input.fullName } });
      await this.audit.log(
        { userId: user.id, action: 'UPDATE', entity: 'User', entityId: user.id, summary: `Cambió su nombre de "${user.fullName}" a "${input.fullName}"`, meta },
        tx,
      );
    });
    return this.profile({ ...user, fullName: input.fullName });
  }

  /** Cierra la sesión en los demás equipos y entrega un token nuevo para este. */
  async revokeOtherSessions(user: SessionUser, meta: RequestMeta): Promise<string> {
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
    await this.audit.log({ userId: user.id, action: 'SESSIONS_REVOKED', entity: 'User', entityId: user.id, summary: 'Cerró su sesión en los demás equipos', meta });
    return this.jwt.signAsync({ sub: user.id, v: updated.tokenVersion });
  }
}
