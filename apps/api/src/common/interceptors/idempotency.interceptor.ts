import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes } from '@clinagenda/schemas';
import { Observable, catchError, from, map, of, switchMap, throwError } from 'rxjs';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthedRequest } from '../decorators/auth.decorators';
import { DomainError } from '../errors/domain-error';

/**
 * Si el navegador manda la misma petición dos veces con el mismo "Idempotency-Key"
 * (porque se cortó el internet y reintentó, o alguien presionó Guardar dos veces),
 * la segunda vez se devuelve la misma respuesta en lugar de crear otra cita.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const raw = req.headers['idempotency-key'];
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (!key) return next.handle();
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
      throw DomainError.validation('La clave de reintento no es válida.');
    }

    const route = `${req.method} ${req.route?.path ?? req.path}`;
    const scopedKey = `${req.user.id}:${key}`;

    return from(this.reserve(scopedKey, req.user.id, route)).pipe(
      switchMap((previous) => {
        if (previous) {
          if (previous.statusCode == null) {
            throw DomainError.conflict(ErrorCodes.CONFLICT, 'Esta misma solicitud todavía se está procesando. Espere unos segundos.');
          }
          res.status(previous.statusCode);
          res.setHeader('Idempotent-Replay', 'true');
          return of(previous.responseBody);
        }
        return next.handle().pipe(
          switchMap((body) =>
            from(
              this.prisma.idempotencyKey.update({
                where: { key: scopedKey },
                data: { statusCode: res.statusCode || HttpStatus.CREATED, responseBody: (body ?? null) as Prisma.InputJsonValue },
              }),
            ).pipe(map(() => body)),
          ),
          catchError((err) => {
            // Si falló, se libera la clave para que el reintento sí pueda intentarlo de nuevo.
            return from(this.prisma.idempotencyKey.delete({ where: { key: scopedKey } }).catch(() => undefined)).pipe(
              switchMap(() => throwError(() => err)),
            );
          }),
        );
      }),
    );
  }

  /** Devuelve null si la clave es nueva (y la reserva), o el registro previo si ya existía. */
  private async reserve(key: string, userId: string, route: string) {
    try {
      await this.prisma.idempotencyKey.create({ data: { key, userId, route } });
      return null;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.idempotencyKey.findUnique({ where: { key } });
      }
      throw e;
    }
  }
}
