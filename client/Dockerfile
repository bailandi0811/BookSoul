# syntax=docker/dockerfile:1
FROM node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90 AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/index.html client/vite.config.ts client/tsconfig.json client/tsconfig.app.json client/tsconfig.node.json client/postcss.config.js client/tailwind.config.js ./
COPY client/src ./src
COPY client/public ./public
RUN npm run build

FROM nginx:1.28.3-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80 443
