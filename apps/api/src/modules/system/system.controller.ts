import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { readFile } from 'node:fs/promises';
import { Roles } from '../../common/decorators/auth.decorators';
import { env } from '../../config/env';

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
@Roles('ADMIN')
export class SystemController {
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
