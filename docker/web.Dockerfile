# Web de ClinAgenda (Next.js, salida standalone). Se construye desde la raíz del repositorio.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/schemas/package.json packages/schemas/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @clinagenda/schemas --workspace @clinagenda/web --include-workspace-root --no-audit --no-fund
COPY packages/schemas packages/schemas
COPY apps/web apps/web
# Dirección interna de la API dentro de la red de Docker (se fija al construir: Next la usa en los rewrites).
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @clinagenda/schemas && npm run build -w @clinagenda/web

FROM node:22-alpine
RUN apk add --no-cache wget
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:3000/ingresar >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
