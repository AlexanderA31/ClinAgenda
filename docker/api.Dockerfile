# API de ClinAgenda (NestJS + Prisma). Se construye desde la raíz del repositorio.
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/schemas/package.json packages/schemas/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @clinagenda/schemas --workspace @clinagenda/api --include-workspace-root --no-audit --no-fund
COPY packages/schemas packages/schemas
COPY apps/api apps/api
RUN npm run build -w @clinagenda/schemas && npm run build -w @clinagenda/api

FROM node:22-alpine
RUN apk add --no-cache openssl wget
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/schemas/package.json ./packages/schemas/
COPY --from=build /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh
WORKDIR /app/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
ENTRYPOINT ["api-entrypoint.sh"]
