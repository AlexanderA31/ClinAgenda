import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().default(4000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres (genere uno con: openssl rand -hex 32)'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  BACKUP_STATUS_FILE: z.string().default('/backups/estado.json'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Falla al arrancar (con un mensaje claro) si falta una variable, en vez de fallar a mitad de una cita. */
export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración incompleta. Revise el archivo .env:\n${problems}`);
  }
  return parsed.data;
}

export const env = loadEnv();
