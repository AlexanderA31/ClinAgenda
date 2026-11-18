import type { ApiError } from '@clinagenda/schemas';

/** Error de la API con el mensaje humano y los campos a corregir. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(body.message);
  }
  get fields() {
    return this.body.fields ?? {};
  }
  get code() {
    return this.body.code;
  }
}

/** Sin conexión con el servidor (internet caído o API apagada). */
export class OfflineError extends Error {
  constructor() {
    super('No hay conexión con el sistema. Revise el internet; lo que escribió no se ha perdido.');
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; query?: Record<string, string | number | boolean | undefined | null> };

/** Cliente único hacia /api (Next lo reenvía a la API). La cookie de sesión viaja sola. */
export async function api<T>(path: string, { body, query, headers, ...init }: Options = {}): Promise<T> {
  const qs = query
    ? '?' +
      new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs}`, {
      ...init,
      credentials: 'same-origin',
      headers: { ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new OfflineError();
  }

  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/') && !path.startsWith('/portal/login') && !path.startsWith('/portal/register')) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    // El portal del paciente tiene su propio ingreso.
    window.location.href = path.startsWith('/portal/') ? `/paciente/ingresar?vence=1&next=${next}` : `/ingresar?vence=1&next=${next}`;
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new OfflineError();

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiRequestError(res.status, data ?? { statusCode: res.status, code: 'HTTP', message: 'No se pudo completar la acción.' });
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError || e instanceof OfflineError) return e.message;
  return 'Algo salió mal. Intente de nuevo.';
}
