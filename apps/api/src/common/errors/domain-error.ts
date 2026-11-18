import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '@clinagenda/schemas';

type Code = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Error de negocio con un mensaje pensado para la recepcionista, no para un programador.
 * `fields` permite marcar el campo exacto del formulario que hay que corregir.
 */
export class DomainError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: Code,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly details?: unknown,
  ) {
    super({ statusCode: status, code, message, fields, details }, status);
  }

  static notFound(what: string) {
    return new DomainError(HttpStatus.NOT_FOUND, ErrorCodes.NOT_FOUND, `No encontramos ${what}. Puede que se haya escrito mal o que ya no exista.`);
  }

  static forbidden(message = 'Su usuario no tiene permiso para hacer esto. Si lo necesita, pídalo a la dirección.') {
    return new DomainError(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, message);
  }

  static validation(message: string, fields?: Record<string, string>) {
    return new DomainError(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION, message, fields);
  }

  static conflict(code: Code, message: string, fields?: Record<string, string>, details?: unknown) {
    return new DomainError(HttpStatus.CONFLICT, code, message, fields, details);
  }
}
