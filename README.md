# ClinAgenda

Sistema de agendamiento de citas para las tres clínicas de la Dra. Paredes (Centro, Norte y Sur): 12 médicos, 5 recepcionistas y unos 400 pacientes al mes. Reemplaza el cuaderno y el WhatsApp con una agenda que **no deja cruzar citas**, **no pierde ninguna** y que una recepcionista sin experiencia en computadoras puede usar sola.

- **Probarlo en 5 minutos:** [INSTRUCCIONES.md](INSTRUCCIONES.md)
- **Qué se decidió y por qué (incluye lo que falta):** [DECISIONES.md](DECISIONES.md)
- **API documentada (Swagger):** http://localhost:4000/api/docs una vez levantado

```bash
cp .env.example .env    # cambie POSTGRES_PASSWORD y JWT_SECRET
docker compose up --build
# Web: http://localhost:3000 · usuario rosa / Demo2026!
```

## Qué resuelve

| Situación | Qué hace el sistema |
|---|---|
| Dos recepcionistas dan la misma hora en el mismo segundo | La base de datos solo acepta una; la otra ve “ese horario acaba de ocuparse”. |
| El Dr. Salazar atiende en dos clínicas | Su horario semanal es por clínica y nunca puede estar en dos a la vez. |
| Se cae el internet en la Clínica Sur | La agenda abierta se sigue viendo; las citas nuevas quedan “pendientes de enviar” y se envían solas. |
| Alguien cancela por error | Botón Deshacer. Nada se borra; todo queda en la bitácora. |
| Cédula `0000000000`, teléfono `12345`, nacido en 2090 | Se rechaza con un mensaje que dice qué corregir, sin borrar el formulario. |
| “Juan Pérez” otra vez | Se muestran pacientes parecidos antes de crear una ficha nueva. |
| Información médica | Cada persona con su usuario; recepción no ve notas clínicas; bitácora inmutable. |

## Arquitectura

```
Navegador ──► web (Next.js 15, :3000) ──/api──► api (NestJS 11, :4000) ──► PostgreSQL 17
               PWA + service worker              Prisma · Swagger              EXCLUDE · triggers
                         ▲                              ▲                         ▲
                         └──── packages/schemas (Zod) ──┘                  backup (pg_dump diario)
```

- **`packages/schemas`** — contrato compartido: schemas Zod de cada entidad y validadores de dominio (cédula con dígito verificador, teléfonos E.164, limpieza de nombres, fechas). Lo usan la API (validación + Swagger vía `nestjs-zod`) y la web (formularios con `react-hook-form`). Una regla, un solo lugar.
- **`apps/api`** — NestJS modular: `auth`, `users`, `clinics`, `doctors`, `patients`, `appointments`, `waitlist`, `reports`, `imports`, `audit`, `health`. Guardias globales de sesión y rol, filtro único de errores con mensajes en español, idempotencia para reintentos.
- **`apps/web`** — Next.js App Router con Tailwind 4 y componentes al estilo shadcn/ui; tablas con **TanStack Table** (paginación en servidor) y gráficos con **Recharts** (estilo shadcn charts). La web reenvía `/api/*` a la API, así sesión y caché son del mismo origen.
- **Base de datos** — Prisma para el modelo; las reglas críticas están en SQL (`apps/api/prisma/migrations`): restricción `EXCLUDE` contra citas solapadas por médico y por paciente, prohibición de borrar citas, bitácora de solo agregar, índice de trigramas para nombres.

```
.
├── apps/
│   ├── api/            NestJS + Prisma (src/modules/*, prisma/schema.prisma, test/*.e2e.ts)
│   └── web/            Next.js (app/(app)/* pantallas internas, app/page.tsx landing, components/*)
├── packages/schemas/   Zod + validadores (con pruebas)
├── docker/             Dockerfiles, entrypoint, script de respaldo
├── docker-compose.yml  db · api · web · backup
├── DECISIONES.md
└── INSTRUCCIONES.md
```

## Comandos

| Comando | Qué hace |
|---|---|
| `docker compose up --build` | Levanta todo (migra y carga datos de demostración la primera vez) |
| `npm install && npm run build:schemas` | Prepara el entorno local |
| `npm run dev:api` / `npm run dev:web` | Desarrollo con recarga (requiere una base PostgreSQL y `apps/api/.env`) |
| `npm test -w @clinagenda/schemas` | Pruebas de validadores y reglas de paciente |
| `npm run test:e2e -w @clinagenda/api` | Pruebas de punta a punta contra PostgreSQL |

## Stack

Node 22 · TypeScript · NestJS 11 · Prisma 6 · PostgreSQL 17 · Zod · nestjs-zod / Swagger · Next.js 15 · React 19 · Tailwind CSS 4 · TanStack Query y Table · Recharts · Docker Compose.

## Datos

Todos los datos de demostración son inventados. No se suben datos reales, contraseñas ni llaves: ver `.gitignore` y `.env.example`.
