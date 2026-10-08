# syntax=docker/dockerfile:1
FROM node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90 AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server

FROM base AS build
COPY server/package.json server/package-lock.json ./
COPY server/prisma ./prisma
RUN npm ci --no-audit --no-fund
RUN DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/build_only npm run prisma:generate
COPY server/tsconfig.json server/tsconfig.build.json server/nest-cli.json ./
COPY server/src ./src
RUN npm run build

# Explicit operator command only; does not start the API/worker or run migrations.
FROM base AS migration
COPY --from=build /app/server/node_modules ./node_modules
COPY server/package.json server/package-lock.json ./
COPY server/prisma ./prisma
USER node
CMD ["./node_modules/.bin/prisma", "--version"]

FROM build AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 BOOK_UPLOAD_DIR=/data/books
COPY --from=production-dependencies --chown=node:node /app/server/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/dist ./dist
COPY server/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
