import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { ApiError, ErrorCodes } from '@clinagenda/schemas';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

/** Convierte cualquier error en la forma única `ApiError`, con mensajes que entiende cualquier persona. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toApiError(exception);
    res.status(body.statusCode).json(body);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof ZodValidationException) {
      return fromZod(exception.getZodError() as ZodError);
    }

    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: ErrorCodes.TOO_MANY_ATTEMPTS,
        message: 'Demasiados intentos seguidos. Espere un minuto y vuelva a intentar.',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response && 'code' in response) {
        return response as ApiError;
      }
      return {
        statusCode: status,
        code: status === 401 ? ErrorCodes.UNAUTHORIZED : status === 403 ? ErrorCodes.FORBIDDEN : status === 404 ? ErrorCodes.NOT_FOUND : 'HTTP_' + status,
        message: friendlyHttpMessage(status),
      };
    }

    const constraint = constraintViolation(exception);
    if (constraint) return constraint;

    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      return { statusCode: 404, code: ErrorCodes.NOT_FOUND, message: 'No encontramos el registro. Puede que otra persona lo haya cambiado.' };
    }

    // Error inesperado: se registra completo en el servidor con un número de incidente,
    // y a la persona se le dice qué hacer, sin detalles técnicos.
    const incident = randomUUID().slice(0, 8).toUpperCase();
    this.logger.error(`Incidente ${incident}`, exception instanceof Error ? exception.stack : String(exception));
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL,
      message: `Algo falló de nuestro lado y no se guardó el cambio. Intente de nuevo en un momento; si vuelve a pasar, avise a la dirección con el código ${incident}.`,
      details: { incident },
    };
  }
}

export function fromZod(error: ZodError): ApiError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const count = Object.keys(fields).length;
  return {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ErrorCodes.VALIDATION,
    message: count === 1 ? 'Hay un dato por corregir.' : `Hay ${count} datos por corregir.`,
    fields,
  };
}

/** Traduce las reglas que protege la base de datos (constraints) a mensajes humanos. */
function constraintViolation(exception: unknown): ApiError | null {
  const text = exception instanceof Error ? exception.message : String(exception);
  if (text.includes('appointment_doctor_no_overlap')) {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCodes.SLOT_TAKEN,
      message: 'Ese horario acaba de ser ocupado por otra cita de este médico (puede que en otra clínica). Elija otra hora.',
    };
  }
  if (text.includes('appointment_patient_no_overlap')) {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCodes.PATIENT_OVERLAP,
      message: 'Este paciente ya tiene otra cita a esa misma hora.',
    };
  }
  if (text.includes('patient_document_unique')) {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCodes.POSSIBLE_DUPLICATE,
      message: 'Ya existe un paciente con ese número de documento. Búsquelo en lugar de crearlo de nuevo.',
      fields: { documentNumber: 'Este documento ya está registrado.' },
    };
  }
  if (text.includes('40P01') || text.includes('40001') || text.includes('deadlock detected')) {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCodes.CONFLICT,
      message: 'Otra persona estaba guardando un cambio parecido en el mismo momento. No se guardó nada; revise la agenda e intente de nuevo.',
    };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
    return { statusCode: HttpStatus.CONFLICT, code: ErrorCodes.CONFLICT, message: 'Ya existe un registro con esos datos.' };
  }
  return null;
}

function friendlyHttpMessage(status: number): string {
  switch (status) {
    case 401:
      return 'Su sesión terminó. Vuelva a ingresar con su usuario y contraseña.';
    case 403:
      return 'Su usuario no tiene permiso para hacer esto.';
    case 404:
      return 'No encontramos lo que busca.';
    case 413:
      return 'El archivo es demasiado grande.';
    default:
      return 'No se pudo completar la acción. Revise los datos e intente de nuevo.';
  }
}
