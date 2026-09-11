FROM node:24.18.0-bookworm-slim AS node-base
RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM node-base AS dependencies
WORKDIR /workspace/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM node-base AS build
WORKDIR /workspace/backend
ENV MIGRATION_DATABASE_URL=postgresql://schema_only:schema_only@127.0.0.1:1/schema_only
COPY --from=dependencies /workspace/backend/node_modules ./node_modules
COPY backend/ ./
COPY docs/backend-contracts/openapi.yaml /workspace/docs/backend-contracts/openapi.yaml
RUN npm run db:generate \
  && npm run db:migration:check \
  && npm run build \
  && npm run openapi:check

FROM node-base AS migrator
WORKDIR /app
COPY --from=dependencies --chown=node:node /workspace/backend/node_modules ./node_modules
COPY --chown=node:node backend/package.json backend/package-lock.json backend/prisma.config.ts ./
COPY --chown=node:node backend/prisma ./prisma
COPY --chown=node:node backend/scripts/file-json-secret.mjs ./scripts/file-json-secret.mjs
COPY --chown=node:node backend/scripts/harden-runtime-database-access.mjs ./scripts/harden-runtime-database-access.mjs
COPY --chown=node:node backend/scripts/postgres-tls.mjs ./scripts/postgres-tls.mjs
COPY --chown=node:node backend/scripts/run-migration-with-secrets.mjs ./scripts/run-migration-with-secrets.mjs
COPY --from=build --chown=node:node /workspace/backend/src/generated/prisma ./src/generated/prisma
USER node
CMD ["npm", "run", "db:migrate:deploy:container"]

FROM node-base AS production-dependencies
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node-base AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 bnbu && useradd --system --uid 10001 --gid bnbu --home-dir /nonexistent --shell /usr/sbin/nologin bnbu
COPY --from=production-dependencies --chown=bnbu:bnbu /app/node_modules ./node_modules
COPY --from=build --chown=bnbu:bnbu /workspace/backend/dist ./dist
COPY --from=build --chown=bnbu:bnbu /workspace/backend/package.json ./package.json
USER bnbu
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/v1/health/live`).then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
