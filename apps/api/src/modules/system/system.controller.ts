import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { readFile } from 'node:fs/promises';
import type { SystemStatus } from '@clinagenda/schemas';
import { Can } from '../../common/decorators/auth.decorators';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

export interface BackupStatus {
  state: 'OK' | 'SIN_COPIA_EXTERNA' | 'ATRASADO' | 'FALLO' | 'DESCONOCIDO';
  message: string;
  lastAt: string | null;
  file: string | null;
  bytes: number;
}

/** Para que la dirección "duerma tranquila": el panel avisa si el respaldo falló, está atrasado o no salió del servidor. */
@ApiTags('Sistema')
@Controller('system')
@Can('sistema.ver')
export class SystemController {
  constructor(private readonly prisma: PrismaService) {}

  /** Lo que un administrador revisa a diario: accesos, actividad y salud de la base de datos. */
  @Get('status')
  async status(): Promise<SystemStatus> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3600_000);
    const [usersActive, usersInactive, usersLocked, usersPending, roles, patients, futureAppointments, totalAppointments, changes24h, failedLogins24h, db, migration] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { active: true } }),
        this.prisma.user.count({ where: { active: false } }),
        this.prisma.user.count({ where: { active: true, lockedUntil: { gt: now } } }),
        this.prisma.user.count({ where: { active: true, mustChangePassword: true } }),
        this.prisma.accessRole.count(),
        this.prisma.patient.count(),
        this.prisma.appointment.count({ where: { startsAt: { gte: now }, status: 'SCHEDULED' } }),
        this.prisma.appointment.count(),
        this.prisma.auditLog.count({ where: { at: { gte: dayAgo }, action: { notIn: ['LOGIN', 'LOGIN_FAILED'] } } }),
        this.prisma.auditLog.count({ where: { at: { gte: dayAgo }, action: 'LOGIN_FAILED' } }),
        this.prisma.$queryRaw<{ bytes: bigint; version: string }[]>`SELECT pg_database_size(current_database()) AS bytes, current_setting('server_version') AS version`,
        this.prisma.$queryRaw<{ name: string; at: Date }[]>`SELECT migration_name AS name, finished_at AS at FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`,
      ]);
    return {
      appVersion: process.env.npm_package_version ?? '0.1.0',
      startedAt: new Date(now.getTime() - process.uptime() * 1000).toISOString(),
      database: { version: db[0]?.version ?? '', bytes: Number(db[0]?.bytes ?? 0), lastMigration: migration[0]?.name ?? null },
      users: { active: usersActive, inactive: usersInactive, locked: usersLocked, pendingPassword: usersPending },
      roles,
      patients,
      appointments: { total: totalAppointments, upcoming: futureAppointments },
      activity: { changes24h, failedLogins24h },
    };
  }

  @Get('backup')
  async backup(): Promise<BackupStatus> {
    let raw: { at: string; file: string; bytes: number; ok: boolean; copied: boolean; error: string; intervalHours: number };
    try {
      raw = JSON.parse(await readFile(env.BACKUP_STATUS_FILE, 'utf8'));
    } catch {
      return { state: 'DESCONOCIDO', message: 'No hay información de respaldos. Revise que el servicio de respaldo esté encendido.', lastAt: null, file: null, bytes: 0 };
    }
    const ageHours = (Date.now() - new Date(raw.at).getTime()) / 3600_000;
    const base = { lastAt: raw.at, file: raw.file, bytes: raw.bytes };
    if (!raw.ok) return { ...base, state: 'FALLO', message: `El último respaldo falló: ${raw.error}. Avise a soporte hoy mismo.` };
    if (ageHours > raw.intervalHours + 2) return { ...base, state: 'ATRASADO', message: `El último respaldo tiene ${Math.floor(ageHours)} horas. El servicio de respaldo podría estar detenido.` };
    if (!raw.copied) return { ...base, state: 'SIN_COPIA_EXTERNA', message: `El respaldo se hizo, pero no se copió fuera del servidor (${raw.error}). Si el servidor se daña, se perdería.` };
    return { ...base, state: 'OK', message: 'Respaldo al día y copiado fuera del servidor.' };
  }
}
