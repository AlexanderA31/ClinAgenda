import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export const PATIENT_COOKIE = 'clinagenda_paciente';

export interface PatientSession {
  accountId: string;
  patientId: string;
}

interface PatientRequest extends Request {
  patient: PatientSession;
}

/**
 * Sesión del portal del paciente: cookie aparte de la del personal y token marcado como "patient",
 * así una sesión de paciente nunca abre pantallas del sistema interno (y viceversa).
 */
@Injectable()
export class PatientAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PatientRequest>();
    const header = req.headers.authorization;
    const token = (req.cookies?.[PATIENT_COOKIE] as string | undefined) ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) throw new UnauthorizedException();
    let payload: { sub: string; kind?: string; v?: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.kind !== 'patient') throw new UnauthorizedException();
    const account = await this.prisma.patientAccount.findUnique({ where: { id: payload.sub } });
    if (!account || account.tokenVersion !== (payload.v ?? 0)) throw new UnauthorizedException();
    req.patient = { accountId: account.id, patientId: account.patientId };
    return true;
  }
}

export const CurrentPatient = createParamDecorator((_: unknown, ctx: ExecutionContext): PatientSession => ctx.switchToHttp().getRequest<PatientRequest>().patient);
