FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
# Only the client and shared workspaces: the server's native modules (better-sqlite3)
# need a compiler toolchain this stage doesn't have, and the client never uses them.
RUN npm ci -w @card-table/shared -w @card-table/client
COPY shared shared
COPY client client
RUN npm run build -w @card-table/shared && npm run build -w @card-table/client

FROM nginx:alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
# The base image renders /etc/nginx/templates/*.template through envsubst and
# runs /docker-entrypoint.d/*.sh before starting nginx.
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY client/docker-entrypoint.d/10-runtime-config.sh /docker-entrypoint.d/10-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/10-runtime-config.sh
# Overridden by compose; named here so the image runs standalone.
ENV SERVER_UPSTREAM=server:2567
EXPOSE 80
