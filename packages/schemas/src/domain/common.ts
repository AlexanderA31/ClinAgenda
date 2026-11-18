import { z } from 'zod';
import { cleanText } from '../validators/text';

export const IdSchema = z.string().uuid({ message: 'Identificador no válido.' });

/** Texto libre corto ya limpio de emojis/caracteres de control. */
/** Limpia el texto ANTES de validar, así la validación ve lo mismo que se guardará. */
export const cleaned = <T extends z.ZodTypeAny>(clean: (v: string) => string, schema: T) =>
  z.preprocess((v) => (typeof v === 'string' ? clean(v) : v), schema);

export const cleanString = (max: number, label: string) =>
  cleaned(
    cleanText,
    z.string({ required_error: `${label} es obligatorio.`, invalid_type_error: `${label} debe ser texto.` }).max(max, `${label} no puede pasar de ${max} caracteres.`),
  );

export const optionalCleanString = (max: number, label: string) =>
  z.preprocess(
    (v) => (v == null ? null : typeof v === 'string' ? cleanText(v) || null : v),
    z.string().max(max, `${label} no puede pasar de ${max} caracteres.`).nullable(),
  );

/** "08:30" en formato 24 h. */
export const TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato de 24 horas, por ejemplo 08:30 o 14:00.');

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional().transform((v) => (v ? cleanText(v) : undefined)),
  sortBy: z.string().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Esquemas de las respuestas: solo describen lo que devuelve la API (para Swagger y los tipos de la web).
 * Las fechas y horas van en ISO 8601 (UTC); las fechas sin hora, AAAA-MM-DD.
 */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const IsoDaySchema = z.string().date();

/** Página de resultados: `items` más los totales para la paginación. */
export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), total: z.number().int(), page: z.number().int(), pageSize: z.number().int(), pageCount: z.number().int() });
}

export const OkSchema = z.object({ ok: z.literal(true) });

/** Forma única de todos los errores que devuelve la API. `message` está escrito para personas, no para programadores. */
export const ApiErrorSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string()).optional(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ErrorCodes = {
  VALIDATION: 'VALIDATION',
  SLOT_TAKEN: 'SLOT_TAKEN',
  PATIENT_OVERLAP: 'PATIENT_OVERLAP',
  PAST_DATE: 'PAST_DATE',
  OUTSIDE_SCHEDULE: 'OUTSIDE_SCHEDULE',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  POSSIBLE_DUPLICATE: 'POSSIBLE_DUPLICATE',
  UNDO_NOT_POSSIBLE: 'UNDO_NOT_POSSIBLE',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  INTERNAL: 'INTERNAL',
} as const;
